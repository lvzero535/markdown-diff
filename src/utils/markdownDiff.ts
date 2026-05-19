import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'
import { createLowlight, common as lowlightCommon } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import DiffMatchPatch from 'diff-match-patch'
import { diffWordsWithSpace } from 'diff'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { visit } from 'unist-util-visit'
import type { Root, RootContent } from 'mdast'
import type { Root as HastRoot, Element, ElementContent } from 'hast'

type DiffType = 'equal' | 'insert' | 'delete'
type AnnotatedDiffType = 'insert' | 'delete' | 'modified' | 'unchanged'

/** diff 匹配配置 */
export type DiffConfig = {
  /** 内容相似度阈值（0~1），默认 0.35 */
  similarityThreshold: number
}

const DEFAULT_DIFF_CONFIG: DiffConfig = { similarityThreshold: 0.35 }

export type MdastNode = { type: string; [key: string]: unknown }

export type DiffHunk = {
  id: string
  diffType: 'insert' | 'delete' | 'modified'
  index: number
  path: number[]
  /** 该 hunk 在旧 AST 中的位置（用于 accept 操作时修改 oldAst） */
  oldIndex: number
  /** 该 hunk 在旧 AST 中的路径（用于 accept 操作时修改 oldAst） */
  oldPath: number[]
  oldNode?: MdastNode
  newNode?: MdastNode
}

export type MergedResult = {
  mdast: { type: 'root'; children: MdastNode[] }
  hunks: Map<string, DiffHunk>
}

const dmp = new DiffMatchPatch()
const lowlight = createLowlight(lowlightCommon)

/** 使用 lowlight 对文本进行语法高亮，返回 HTML 字符串 */
function highlightCodeText(text: string, lang: string): string {
  if (!lang) return escapeHtml(text)
  try {
    const tree = lowlight.highlight(lang, text)
    return toHtml(tree)
  } catch {
    // 语言未注册或不支持，回退为纯文本
    return escapeHtml(text)
  }
}

const rehypeProcessor = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeHighlight, { detect: true, subset: true } as any)
  .use(rehypeDiffAnnotations)
  .use(rehypeStringify)

/**
 * 解析 Markdown 文本并生成 mdast 抽象语法树。
 *
 * @param markdown - 待解析的 Markdown 原文。
 * @returns 解析后的 `mdast.Root` 节点。
 */
export function parseMarkdown(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root
}

/**
 * 将 mdast 转换回 Markdown 字符串。
 *
 * @param ast - 需要序列化的 mdast 根节点。
 * @returns Markdown 文本。
 */
export function mdastToMarkdown(ast: Root): string {
  return toMarkdown(ast, { extensions: [gfmToMarkdown()], bullet: '-' })
}

export type DiffMode = 'word' | 'char'

/**
 * 对两个文本执行差异比较。
 *
 * @param oldText - 原始文本。
 * @param newText - 新文本。
 * @param mode - 比较模式，`word` 按词比较，`char` 按字符比较。
 * @returns diff 结果数组。
 */
export function diffText(oldText: string, newText: string, mode: DiffMode = 'word') {
  if (mode === 'word') {
    return diffWordsWithSpace(oldText, newText).map(
      (part) => [part.added ? 1 : part.removed ? -1 : 0, part.value] as [number, string]
    )
  }

  const diffs = dmp.diff_main(oldText, newText)
  dmp.diff_cleanupSemantic(diffs)
  return diffs
}

function getDiffModeForNode(oldNode: MdastNode, newNode: MdastNode): DiffMode {
  const type = oldNode.type || newNode.type
  return type === 'code' || type === 'inlineCode' ? 'char' : 'word'
}

/**
 * 合并旧/新 Markdown AST，生成可渲染的 merged AST 和可交互的 diff hunk 索引。
 *
 * 该结果用于主 diff 视图：
 * - `mdast` 负责渲染最终展示内容；
 * - `hunks` 负责支持接受/拒绝单个变更。
 *
 * @param oldAst - 旧版本 Markdown AST。
 * @param newAst - 新版本 Markdown AST。
 * @param config - diff 配置（可选），可设置 similarityThreshold 等。
 * @returns 合并后的 AST 以及对应的 diff hunks。
 */
export function buildMergedMdast(
  oldAst: Root,
  newAst: Root,
  config?: Partial<DiffConfig>
): MergedResult {
  const mergedConfig: DiffConfig = { ...DEFAULT_DIFF_CONFIG, ...config }
  const oldChildren = addKeyToNodes((oldAst.children ?? []) as MdastNode[])
  const newChildren = addKeyToNodes((newAst.children ?? []) as MdastNode[])
  const autoMatchCodeLangs = buildAutoMatchCodeLangs(
    (oldAst.children ?? []) as MdastNode[],
    (newAst.children ?? []) as MdastNode[]
  )
  const diffResult = mergeSubsequence(oldChildren, newChildren, mergedConfig, autoMatchCodeLangs)

  return buildMergedFromDiff(diffResult, mergedConfig)
}

function buildMergedFromDiff(diffResult: DiffNode<MdastNode>[], config?: DiffConfig): MergedResult {
  const hunks = new Map<string, DiffHunk>()
  const children: MdastNode[] = []
  let newAstIndex = 0
  let oldAstIndex = 0

  diffResult.forEach((diffNode, index) => {
    const id = String(index)
    const diffType = diffNode.__data.diffType

    if (diffType === 'insert') {
      const clean = stripMeta(diffNode)
      hunks.set(id, {
        id,
        diffType: 'insert',
        newNode: clean,
        index: newAstIndex,
        path: [newAstIndex],
        oldIndex: oldAstIndex,
        oldPath: [oldAstIndex],
      })
      children.push(annotateNode(clean, id, 'insert'))
      newAstIndex++
      return
    }

    if (diffType === 'delete') {
      const clean = stripMeta(diffNode)
      hunks.set(id, {
        id,
        diffType: 'delete',
        oldNode: clean,
        index: newAstIndex,
        path: [newAstIndex],
        oldIndex: oldAstIndex,
        oldPath: [oldAstIndex],
      })
      children.push(annotateNode(clean, id, 'delete'))
      oldAstIndex++
      return
    }

    if (diffType === 'equal' && diffNode.__data.node) {
      const { oldNode, newNode } = diffNode.__data.node
      const mode = getDiffModeForNode(oldNode, newNode)
      const { node, changed } = mergeEqualNodes(oldNode, newNode, mode, config)
      if (changed) {
        hunks.set(id, {
          id,
          diffType: 'modified',
          oldNode: stripMeta(oldNode),
          newNode: stripMeta(newNode),
          index: newAstIndex,
          path: [newAstIndex],
          oldIndex: oldAstIndex,
          oldPath: [oldAstIndex],
        })
        children.push(annotateNode(node, id, 'modified'))
      } else {
        children.push(annotateNode(node, id, 'unchanged'))
      }
      newAstIndex++
      oldAstIndex++
    }
  })

  return { mdast: { type: 'root', children }, hunks }
}

/**
 * 将 merged AST 渲染为 HTML 字符串。
 *
 * 渲染过程中会先把 Markdown AST 转换为 HAST，再注入 diff 标记和交互按钮，
 * 最后通过 `rehype-stringify` 输出 HTML。
 *
 * @param mdast - 需要渲染的 Markdown AST 根节点。
 * @returns 可直接绑定到 `v-html` 的 HTML 字符串。
 */
export function renderMdastToHtml(mdast: Root): string {
  const normalized = normalizeDiffNodes(mdast as MdastNode)
  const hast = rehypeProcessor.runSync(normalized as Root)
  return rehypeProcessor.stringify(hast)
}

/**
 * 根据用户对某个 diff hunk 的操作，生成新的 Markdown AST。
 *
 * - `accept`：接受当前变更
 * - `reject`：拒绝当前变更
 *
 * 该函数用于支持 diff 面板中的“接受/拒绝”交互按钮。
 *
 * @param newAst - 当前的新版本 AST。
 * @param hunk - 需要处理的差异块。
 * @param action - 用户执行的动作。
 * @returns 处理后的新 AST。
 */
export function applyHunkResolution(
  newAst: Root,
  hunk: DiffHunk,
  action: 'accept' | 'reject'
): Root {
  const result = cloneNode(newAst)
  const children = [...(result.children ?? [])]
  const targetIndex = findNodeByPath(children, hunk.path) ?? hunk.index

  switch (hunk.diffType) {
    case 'insert':
      if (action === 'reject' && targetIndex != null) children.splice(targetIndex, 1)
      break
    case 'delete':
      if (action === 'reject' && hunk.oldNode && targetIndex != null) {
        children.splice(targetIndex, 0, cloneNode(hunk.oldNode) as unknown as RootContent)
      }
      break
    case 'modified':
      if (targetIndex == null) break
      if (action === 'accept' && hunk.newNode)
        children[targetIndex] = cloneNode(hunk.newNode) as unknown as RootContent
      else if (action === 'reject' && hunk.oldNode)
        children[targetIndex] = cloneNode(hunk.oldNode) as unknown as RootContent
      break
  }
  result.children = children
  return result
}

/**
 * 根据用户对某个 diff hunk 的接受操作，修改旧版本 AST，
 * 使旧版本的内容与该 hunk 的新版本内容一致，从而消除该 diff。
 *
 * @param oldAst - 旧版本 Markdown AST。
 * @param hunk - 需要处理的差异块。
 * @returns 处理后的旧版本 AST。
 */
export function applyHunkAcceptOnOldAst(
  oldAst: Root,
  hunk: DiffHunk
): Root {
  const result = cloneNode(oldAst)
  const children = [...(result.children ?? [])]
  const targetIndex = findNodeByPath(children, hunk.oldPath) ?? hunk.oldIndex

  switch (hunk.diffType) {
    case 'insert':
      // 将新增节点插入到旧 AST 的对应位置
      if (hunk.newNode && targetIndex != null) {
        children.splice(targetIndex, 0, cloneNode(hunk.newNode) as unknown as RootContent)
      }
      break
    case 'delete':
      // 从旧 AST 中移除被删除的节点
      if (targetIndex != null) {
        children.splice(targetIndex, 1)
      }
      break
    case 'modified':
      // 用新版本节点替换旧版本节点
      if (targetIndex != null && hunk.newNode) {
        children[targetIndex] = cloneNode(hunk.newNode) as unknown as RootContent
      }
      break
  }
  result.children = children
  return result
}

/**
 * 深拷贝一个节点对象，避免后续修改污染原始 AST。
 *
 * @param node - 需要拷贝的任意节点。
 * @returns 拷贝后的新对象。
 */
function cloneNode<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T
}

/**
 * 判断节点是否为基于 value 的节点（没有 children，只有 value）。
 */
function isValueBasedNode(node: MdastNode): boolean {
  return node.type === 'code' || node.type === 'inlineCode'
}

/**
 * 当 paragraph 等文本容器的 inline 结构发生变化时，
 * 生成结构级 diff，将旧 inline 元素标记为 delete，对应纯文本标记为 insert。
 *
 * 例如 **continued** → continued 会生成：
 *   del("continued") + ins("continued")
 *
 * 例如 highlight → **highlight** 会生成：
 *   del("highlight") + ins(<strong>highlight</strong>)
 *
 * @param oldChildren - 旧子节点数组。
 * @param newChildren - 新子节点数组。
 * @returns 合并后的子节点数组和是否发生变化。
 */
function generateInlineStructureDiff(
  oldChildren: MdastNode[],
  newChildren: MdastNode[]
): { children: MdastNode[]; changed: boolean } {
  const INLINE_TYPES = new Set(['strong', 'emphasis', 'link', 'code', 'inlineCode', 'delete', 'image'])
  const result: MdastNode[] = []
  let changed = false

  const oldHasInline = oldChildren.some((c) => INLINE_TYPES.has(c.type))
  const newHasInline = newChildren.some((c) => INLINE_TYPES.has(c.type))

  if (!oldHasInline && newHasInline) {
    // 旧侧全是纯文本，新侧有 inline 元素
    // 策略：以新侧子节点为框架，在旧侧完整文本中按游标对齐
    // 遇到新 inline 元素时，从旧文本对应位置取出等长文本，标记 del+ins
    const oldFullText = oldChildren.map((c) => String(c.value ?? '')).join('')
    let oldOffset = 0

    for (const newChild of newChildren) {
      const newText = newChild.type === 'text'
        ? String(newChild.value ?? '')
        : extractTextFromNode(newChild)

      if (newChild.type === 'text') {
        // 公共纯文本 → 直接输出
        result.push({ type: 'text', value: newText })
      } else if (INLINE_TYPES.has(newChild.type)) {
        // 新 inline 元素 → 从旧文本对应位置取出等长文本，标记结构变化
        const oldPart = oldFullText.substring(oldOffset, oldOffset + newText.length)
        result.push({ type: 'diff', diffType: 'delete', value: oldPart })
        result.push({ type: 'diff', diffType: 'insert', value: newText, originalNode: newChild })
        changed = true
      }
      oldOffset += newText.length
    }

    return { children: result, changed }
  }

  // 旧侧有 inline 元素，新侧全是纯文本（或双侧都有 inline 但结构不同）
  // 策略：以旧侧子节点为框架，旧 inline → del+ins(纯文本)
  for (const oldChild of oldChildren) {
    const isOldInline = INLINE_TYPES.has(oldChild.type)
    const oldText = extractTextFromNode(oldChild)

    if (!isOldInline && oldChild.type === 'text') {
      // 纯文本节点 → 直接保留（公共部分）
      result.push(stripMeta(oldChild))
    } else if (isOldInline) {
      // 旧 inline 元素 → 标记为 delete（保留原始格式节点，渲染时恢复格式）
      result.push({ type: 'diff', diffType: 'delete', value: oldText, originalNode: oldChild })
      // 查找新节点中对应的纯文本 → 标记为 insert
      result.push({ type: 'diff', diffType: 'insert', value: oldText })
      changed = true
    }
  }

  // 处理新节点中多出的 inline 元素（旧节点中没有的）
  const oldInlineTexts = new Set(
    oldChildren.filter((c) => INLINE_TYPES.has(c.type)).map((c) => extractTextFromNode(c))
  )
  for (const child of newChildren) {
    if (INLINE_TYPES.has(child.type)) {
      const text = extractTextFromNode(child)
      if (!oldInlineTexts.has(text)) {
        // 新增的 inline 元素（保留原始格式节点）
        result.push({ type: 'diff', diffType: 'delete', value: text })
        result.push({ type: 'diff', diffType: 'insert', value: text, originalNode: child })
        changed = true
      }
    }
  }

  return { children: result, changed: changed || result.some((c) => c.type === 'diff') }
}

/**
 * 辅助函数：推进新节点游标（目前为占位实现）。
 */
function advanceNewCursor(
  _segments: Array<{ type: string; text: string }>,
  _text: string,
  _segIdx: number,
  _charOffset: number
): void {
  // 当前简化实现不需要精确游标推进
}

/**
 * 判断是否应该将节点退化为纯文本级别 diff。
 *
 * 触发条件（满足任一即可）：
 * 1. 新旧子节点中有一边全是纯 text 而另一边包含 inline 元素（strong/em/a/code 等）
 * 2. 新旧子节点的 inline 元素类型集合不一致
 * 3. 子节点数量差异过大（一边 > 2 且另一边 = 1）
 *
 * @param node - 当前父节点。
 * @param oldChildren - 旧子节点。
 * @param newChildren - 新子节点。
 * @returns 是否应该退化为纯文本 diff。
 */
function shouldFlattenToTextDiff(
  node: MdastNode,
  oldChildren: MdastNode[],
  newChildren: MdastNode[]
): boolean {
  // 仅对 paragraph 和 heading 等文本容器做此优化
  if (node.type !== 'paragraph') return false
  if (oldChildren.length === 0 || newChildren.length === 0) return false

  // 检查是否有 inline 元素（非纯 text）
  const INLINE_TYPES = new Set(['strong', 'emphasis', 'link', 'code', 'inlineCode', 'delete', 'image'])
  const oldHasInline = oldChildren.some((c) => INLINE_TYPES.has(c.type))
  const newHasInline = newChildren.some((c) => INLINE_TYPES.has(c.type))

  // 一边有 inline 元素，另一边只有纯 text → 退化
  if (oldHasInline !== newHasInline) return true

  // 一边只有1个子节点而另一边有多个 → 可能需要退化
  const countDiff = Math.abs(oldChildren.length - newChildren.length)
  if (countDiff >= 2 && (oldChildren.length === 1 || newChildren.length === 1)) return true

  return false
}

/**
 * 将 inline mdast 节点递归渲染为 HTML，保留原始格式标签（包括嵌套）。
 * 用于在 diff 标记（<del>/<ins>）中保留 bold/italic/code 等视觉效果。
 *
 * 例如 strong → emphasis → text("hi") 渲染为 <strong><em>hi</em></strong>
 */
function renderInlineNodeAsHtml(node: MdastNode, escapedText: string): string {
  switch (node.type) {
    case 'strong':
      return `<strong>${escapedText}</strong>`
    case 'emphasis':
      return `<em>${escapedText}</em>`
    case 'delete':
      // mdast delete 是 ~~strikethrough~~，HTML 用 <s> 避免与 diff 的 <del> 冲突
      return `<s>${escapedText}</s>`
    case 'inlineCode':
      return `<code>${escapedText}</code>`
    case 'link':
      return `<a href="${escapeHtml(String(node.url ?? ''))}">${escapedText}</a>`
    case 'image':
      return `<img src="${escapeHtml(String(node.url ?? ''))}" alt="${escapeHtml(String(node.alt ?? ''))}" />`
    default:
      return escapedText
  }
}

/**
 * 递归渲染 inline mdast 节点及其子节点为 HTML。
 * 处理嵌套的 inline 结构（如 strong > emphasis > text）。
 */
function renderInlineNodeTreeAsHtml(node: MdastNode): string {
  const INLINE_TYPES = new Set(['strong', 'emphasis', 'link', 'inlineCode', 'delete', 'image'])

  if (node.type === 'text') {
    return escapeHtml(String(node.value ?? ''))
  }

  if (!INLINE_TYPES.has(node.type)) {
    return escapeHtml(extractTextFromNode(node))
  }

  // 递归渲染子节点
  const children = (node.children as MdastNode[] | undefined) ?? []
  const innerHtml = children.map((child) => renderInlineNodeTreeAsHtml(child)).join('')
  return renderInlineNodeAsHtml(node, innerHtml)
}

function normalizeDiffNodes(node: MdastNode): MdastNode {
  if (node.type === 'diff') {
    const diffType = node.diffType as 'insert' | 'delete'
    const text = escapeHtml(String(node.value ?? ''))
    const originalNode = node.originalNode as MdastNode | undefined

    // 保留原始 inline 格式（strong/em/inlineCode 等，包括嵌套）
    let content = text
    if (originalNode) {
      content = renderInlineNodeTreeAsHtml(originalNode)
    }

    return {
      type: 'html',
      value:
        diffType === 'delete'
          ? `<del class="diff-delete">${content}</del>`
          : `<ins class="diff-insert">${content}</ins>`,
    }
  }

  // 处理 code-diff / inlineCode-diff 节点：将字符级 diff 渲染为带标记的 HTML
  // 使用 lowlight 对每个文本段分别进行语法高亮，保留 del/ins 标记
  if (node.type === 'code-diff' || node.type === 'inlineCode-diff') {
    const isBlock = node.type === 'code-diff'
    const lang = String(node.lang ?? '')
    const diffId = String((node.data as Record<string, unknown> | undefined)?.diffId ?? '')
    const diffType = String((node.data as Record<string, unknown> | undefined)?.diffType ?? '')

    const diffHtml = ((node.children as MdastNode[]) ?? [])
      .map((child) => {
        const rawText = String(child.value ?? '')
        if (child.type === 'diff') {
          const tag = child.diffType === 'delete' ? 'del' : 'ins'
          const cls = child.diffType === 'delete' ? 'diff-delete' : 'diff-insert'
          // 对 diff 文本段进行语法高亮
          const highlighted = isBlock ? highlightCodeText(rawText, lang) : escapeHtml(rawText)
          return `<${tag} class="${cls}">${highlighted}</${tag}>`
        }
        // 对未变更文本段进行语法高亮
        return isBlock ? highlightCodeText(rawText, lang) : escapeHtml(rawText)
      })
      .join('')

    // 添加 no-highlight 类，让 rehype-highlight 跳过此 code 元素（已手动高亮）
    const classList = ['hljs']
    if (lang) classList.push(`language-${lang}`)
    classList.push('no-highlight')
    const codeAttrs = [
      `class="${classList.join(' ')}"`,
      diffId ? `data-diff-id="${diffId}"` : '',
      diffType ? `data-diff-type="${diffType}"` : '',
    ]
      .filter(Boolean)
      .join(' ')

    if (isBlock) {
      return {
        type: 'html',
        value: `<pre><code ${codeAttrs}>${diffHtml}</code></pre>`,
      }
    }
    return {
      type: 'html',
      value: `<code ${codeAttrs}>${diffHtml}</code>`,
    }
  }

  if (Array.isArray(node.children)) {
    return {
      ...node,
      children: (node.children as MdastNode[]).map(normalizeDiffNodes),
    }
  }

  return node
}

function findNodeByPath(nodes: MdastNode[], path: number[]): number | null {
  if (!path.length) return null

  let current: MdastNode[] = nodes
  let index: number | null = null

  for (const segment of path) {
    if (!Number.isInteger(segment) || segment < 0 || segment >= current.length) return null
    index = segment
    const next = current[segment].children
    if (!Array.isArray(next)) break
    current = next as MdastNode[]
  }

  return index
}
/**
 * 对文本进行 HTML 转义，防止 diff 标记注入导致页面结构破坏。
 *
 * @param text - 原始文本内容。
 * @returns 转义后的安全 HTML 文本。
 */
function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function stripMeta(node: MdastNode): MdastNode {
  const { key, __data, data, ...rest } = node as MdastNode & {
    key?: string
    __data?: unknown
    data?: unknown
  }
  const result: MdastNode = { ...rest }
  if (Array.isArray(result.children))
    result.children = (result.children as MdastNode[]).map(stripMeta)
  return result
}
/**
 * 判断两个 mdast 节点在去除元数据后是否完全相等。
 *
 * @param a - 第一个节点。
 * @param b - 第二个节点。
 * @returns 两个节点是否完全一致。
 */
function nodesDeepEqual(a: MdastNode, b: MdastNode): boolean {
  return JSON.stringify(stripMeta(a)) === JSON.stringify(stripMeta(b))
}
/**
 * 为节点附加 diff 元信息，方便后续在 HAST 阶段定位和包裹。
 *
 * @param node - 原始节点。
 * @param diffId - 当前差异块的唯一标识。
 * @param diffType - 差异类型。
 * @returns 附加元信息后的节点。
 */
function annotateNode(node: MdastNode, diffId: string, diffType: AnnotatedDiffType): MdastNode {
  return {
    ...node,
    data: {
      ...(node.data as object | undefined),
      diffId,
      diffType,
      hProperties: { dataDiffId: diffId, dataDiffType: diffType },
    },
  }
}
/**
 * 将文本编码为“单词 token 序列”，让 diff-match-patch 以词为单位比较。
 *
 * @param oldText - 原始文本。
 * @param newText - 新文本。
 * @returns 编码后的文本以及词典映射表。
 */
function mergeTextChildren(
  oldText: string,
  newText: string,
  mode: DiffMode = 'word'
): { children: MdastNode[]; changed: boolean } {
  if (oldText === newText) return { children: [{ type: 'text', value: oldText }], changed: false }

  const children: MdastNode[] = []
  for (const [type, text] of diffText(oldText, newText, mode)) {
    if (!text) continue
    if (type === -1) {
      children.push({ type: 'diff', diffType: 'delete', value: text })
    } else if (type === 1) {
      children.push({ type: 'diff', diffType: 'insert', value: text })
    } else {
      children.push({ type: 'text', value: text })
    }
  }

  return { children, changed: true }
}
/**
 * 合并两个相等键对应的节点。
 *
 * 若当前就是文本节点，则继续进入字符级 diff；否则递归比较子节点。
 *
 * @param oldNode - 旧节点。
 * @param newNode - 新节点。
 * @returns 合并后的节点以及是否发生变化。
 */
function mergeEqualNodes(
  oldNode: MdastNode,
  newNode: MdastNode,
  mode: DiffMode = 'word',
  config?: DiffConfig
): { node: MdastNode; changed: boolean } {
  if (oldNode.type === 'text' && newNode.type === 'text') {
    const { children, changed } = mergeTextChildren(
      (oldNode.value as string) || '',
      (newNode.value as string) || '',
      mode
    )
    if (children.length === 1 && children[0].type === 'text') return { node: children[0], changed }
    return { node: { type: 'paragraph', children } as MdastNode, changed }
  }
  // 处理基于 value 的节点（code、inlineCode），它们没有 children
  if (isValueBasedNode(oldNode) && isValueBasedNode(newNode)) {
    const oldValue = String(oldNode.value ?? '')
    const newValue = String(newNode.value ?? '')
    if (oldValue === newValue) return { node: stripMeta(newNode), changed: false }
    const { children, changed } = mergeTextChildren(oldValue, newValue, mode)
    if (!changed) return { node: stripMeta(newNode), changed: false }
    // 创建自定义 type 保留 diff 子节点，由 normalizeDiffNodes 处理渲染
    return {
      node: { ...stripMeta(newNode), type: `${oldNode.type}-diff`, value: undefined, children },
      changed: true,
    }
  }

  const oldChildren = (oldNode.children as MdastNode[] | undefined) ?? []
  const newChildren = (newNode.children as MdastNode[] | undefined) ?? []

  /**
   * 当前节点本身没有子节点时，直接比较节点是否完全一致。
   */
  if (oldChildren.length === 0 && newChildren.length === 0)
    return { node: stripMeta(newNode), changed: !nodesDeepEqual(oldNode, newNode) }

  /**
   * 对于 paragraph 等文本容器节点，当子节点结构发生显著变化时
   * （例如旧的有 strong/em 等 inline 元素，新的合并为纯 text），
   * 退化为纯文本级别 diff 以避免 LCS 对 inline 结构变化产生错误匹配。
   */
  if (shouldFlattenToTextDiff(oldNode, oldChildren, newChildren)) {
    // inline 结构变化（如 **continued** → continued），生成结构级 diff
    const { children, changed } = generateInlineStructureDiff(oldChildren, newChildren)
    return { node: { ...stripMeta(newNode), children }, changed }
  }

  /**
   * tableRow 的子节点（tableCell）必须按列位置配对，
   * 而非用 LCS 自由匹配。否则内容差异大的同一列 cell
   * 会被拆为独立的 delete/insert cell，超出表格列数被截断。
   */
  if (oldNode.type === 'tableRow' && newNode.type === 'tableRow') {
    let rowChanged = false
    const rowChildren: MdastNode[] = []
    const maxLen = Math.max(oldChildren.length, newChildren.length)
    for (let i = 0; i < maxLen; i++) {
      const oldCell = oldChildren[i]
      const newCell = newChildren[i]
      if (oldCell && newCell) {
        const sub = mergeEqualNodes(oldCell, newCell, mode, config)
        if (sub.changed) rowChanged = true
        rowChildren.push(sub.node)
      } else if (newCell) {
        // 新增列
        rowChanged = true
        rowChildren.push(annotateNode(stripMeta(newCell), '', 'insert'))
      } else if (oldCell) {
        // 删除列
        rowChanged = true
        rowChildren.push(annotateNode(stripMeta(oldCell), '', 'delete'))
      }
    }
    return { node: { ...stripMeta(newNode), children: rowChildren }, changed: rowChanged }
  }

  // 递归时透传 config（autoMatchCodeLangs 仅顶层使用）
  const childDiff = mergeSubsequence(addKeyToNodes(oldChildren), addKeyToNodes(newChildren), config)
  let changed = false
  const mergedChildren: MdastNode[] = []

  /**
   * 需要生成行内 diff 标记（<del>/<ins>）的节点类型。
   * 这些节点在 insert/delete 时应保留原始格式（如 <strong>、<em>），
   * 同时用 diff-delete/diff-insert 样式标识变更。
   */
  const INLINE_DIFF_TYPES = new Set(['text', 'strong', 'emphasis', 'link', 'inlineCode', 'delete', 'image'])

  /**
   * 对子节点执行递归合并：
   * - insert / delete 的 inline 节点生成带格式保留的 diff 标记；
   * - insert / delete 的非 inline 节点直接保留原结构；
   * - equal 节点继续向下比较文本差异；
   */
  for (const item of childDiff) {
    const dt = item.__data.diffType

    if (dt === 'insert' || dt === 'delete') {
      changed = true
      const itemNode = stripMeta(item) as MdastNode
      if (INLINE_DIFF_TYPES.has(itemNode.type)) {
        // inline 元素变更：保留原始格式标签，生成 del/ins 标记
        mergedChildren.push({
          type: 'diff',
          diffType: dt,
          value: extractTextFromNode(itemNode),
          originalNode: itemNode,
        })
      } else {
        // 可整体标注的块级子节点（如 tableRow、listItem）：添加 diff 标注
        // 以便 rehype 阶段能识别并渲染红/绿样式
        // 注意：tableCell 不在此列，因为多个 diff cell 会超出列数被截断
        const ANNOTATABLE_CHILD_TYPES = new Set(['tableRow', 'listItem'])
        if (ANNOTATABLE_CHILD_TYPES.has(itemNode.type)) {
          mergedChildren.push(annotateNode(itemNode, '', dt))
        } else {
          mergedChildren.push(itemNode)
        }
      }
    } else if (dt === 'equal' && item.__data.node) {
      const { oldNode: o, newNode: n } = item.__data.node
      /**
       * 文本节点按字符级 diff 拆分，生成 <del>/<ins> 标记。
       */
      if (o.type === 'text' && n.type === 'text') {
        const textMode = getDiffModeForNode(o, n)
        const { children, changed: textChanged } = mergeTextChildren(
          (o.value as string) || '',
          (n.value as string) || '',
          textMode
        )
        if (textChanged) changed = true
        mergedChildren.push(...children)
      } else {
        const subMode = getDiffModeForNode(o, n)
        const sub = mergeEqualNodes(o, n, subMode, config)
        if (sub.changed) changed = true
        mergedChildren.push(sub.node)
      }
    }
  }
  return { node: { ...stripMeta(newNode), children: mergedChildren }, changed }
}

/**
 * 为节点数组补充用于 LCS 比较的 key，并递归处理子节点。
 *
 * @param nodes - 原始节点数组。
 * @returns 添加了 key 的新节点数组。
 */
function addKeyToNodes(nodes: any[]): any[] {
  if (!nodes || !Array.isArray(nodes)) return []
  return nodes.map((node) => {
    if (!node || typeof node !== 'object') return node
    const newNode = { ...node, key: nodeKey(node) }
    if (newNode.children && Array.isArray(newNode.children))
      newNode.children = addKeyToNodes(newNode.children)
    return newNode
  })
}
/**
 * 为单个节点生成结构 key。
 * key 只关注节点类型和结构属性，避免把纯文本变化误判为结构变化。
 *
 * @param node - 需要生成 key 的节点。
 * @returns 节点结构 key。
 */
function nodeKey(node: any): string {
  const parts = [node.type]

  /**
   * 不同节点类型附加不同的结构信息，用于提升 LCS 的匹配稳定性。
   */
  switch (node.type) {
    case 'heading':
      parts.push(`d${node.depth}`)
      break
    case 'link':
      parts.push(node.url || '')
      break
    case 'image':
      parts.push(node.url || '', node.alt || '')
      break
    case 'code':
      parts.push(node.lang || '', node.meta || '')
      break
    case 'table':
      parts.push(String(node.align?.length || 0))
      break
    case 'list':
      parts.push(`o${node.ordered ? 1 : 0}`)
      break
  }
  return parts.join('|')
}
/**
 * 递归提取 mdast 节点的纯文本内容。
 *
 * @param node - mdast 节点。
 * @returns 拼接后的纯文本字符串。
 */
function extractTextFromNode(node: MdastNode): string {
  if (!node) return ''
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
    return String(node.value ?? '')
  }
  if (Array.isArray(node.children)) {
    return (node.children as MdastNode[]).map(extractTextFromNode).join('')
  }
  return String(node.value ?? '')
}

/**
 * 递归提取 mdast 节点的"带格式标记"文本，保留 inline 格式信息。
 *
 * 与 extractTextFromNode 不同，此函数会将 inline 元素转换为 markdown 标记，
 * 例如 strong → **text**，em → *text*，inlineCode → `text`，
 * 这样在文本级 diff 时可以体现格式变化。
 *
 * @param node - mdast 节点。
 * @returns 带格式标记的文本字符串。
 */
export function extractFormattedText(node: MdastNode): string {
  if (!node) return ''
  if (node.type === 'text') return String(node.value ?? '')
  if (node.type === 'strong') {
    const inner = Array.isArray(node.children)
      ? (node.children as MdastNode[]).map(extractFormattedText).join('')
      : ''
    return `**${inner}**`
  }
  if (node.type === 'emphasis') {
    const inner = Array.isArray(node.children)
      ? (node.children as MdastNode[]).map(extractFormattedText).join('')
      : ''
    return `*${inner}*`
  }
  if (node.type === 'inlineCode') return '`' + String(node.value ?? '') + '`'
  if (node.type === 'code') {
    const lang = String(node.lang ?? '')
    return '```' + lang + '\n' + String(node.value ?? '') + '\n```'
  }
  if (node.type === 'link') {
    const inner = Array.isArray(node.children)
      ? (node.children as MdastNode[]).map(extractFormattedText).join('')
      : ''
    return `[${inner}](${String(node.url ?? '')})`
  }
  if (node.type === 'image') {
    return `![${String(node.alt ?? '')}](${String(node.url ?? '')})`
  }
  if (node.type === 'delete') {
    const inner = Array.isArray(node.children)
      ? (node.children as MdastNode[]).map(extractFormattedText).join('')
      : ''
    return `~~${inner}~~`
  }
  if (Array.isArray(node.children)) {
    return (node.children as MdastNode[]).map(extractFormattedText).join('')
  }
  return String(node.value ?? '')
}

/**
 * 基于文本 LCS 计算两个节点的相似度。
 *
 * 提取节点纯文本后，用 LCS 长度占较长文本长度的比例作为相似度。
 * 两个空文本的相似度定义为 1.0。
 *
 * @param oldText - 旧文本。
 * @param newText - 新文本。
 * @returns 相似度（0~1）。
 */
function computeTextSimilarity(oldText: string, newText: string): number {
  if (oldText.length === 0 && newText.length === 0) return 1.0
  if (oldText.length === 0 || newText.length === 0) return 0.0

  const lcsLen = textLCSLength(oldText, newText)
  return lcsLen / Math.max(oldText.length, newText.length)
}

/**
 * 计算两个字符串的 LCS 长度。
 *
 * @param a - 字符串 a。
 * @param b - 字符串 b。
 * @returns LCS 长度。
 */
function textLCSLength(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[m][n]
}

/**
 * 找出新旧子节点中各 lang 只出现 1 次的 code lang 集合（1:1 自动匹配）。
 *
 * @param oldChildren - 旧子节点。
 * @param newChildren - 新子节点。
 * @returns 1:1 code lang 集合。
 */
function buildAutoMatchCodeLangs(oldChildren: MdastNode[], newChildren: MdastNode[]): Set<string> {
  const countOld = new Map<string, number>()
  const countNew = new Map<string, number>()

  for (const node of oldChildren) {
    if (node.type === 'code') {
      const lang = String(node.lang ?? '')
      countOld.set(lang, (countOld.get(lang) ?? 0) + 1)
    }
  }
  for (const node of newChildren) {
    if (node.type === 'code') {
      const lang = String(node.lang ?? '')
      countNew.set(lang, (countNew.get(lang) ?? 0) + 1)
    }
  }

  const result = new Set<string>()
  countOld.forEach((count, lang) => {
    if (count === 1 && (countNew.get(lang) ?? 0) === 1) {
      result.add(lang)
    }
  })
  return result
}

/**
 * 判断两个节点是否可以匹配（被视为同一元素）。
 *
 * 匹配规则：
 * - 类型必须相同
 * - heading 需要 depth 相同
 * - code 需要 lang 相同
 * - link 需要 url 相同
 * - image 需要 url + alt 相同
 * - 对于 1:1 code lang（autoMatchCodeLangs 中的），跳过相似度检查直接匹配
 * - 其他类型相同节点需相似度 >= threshold
 * - 无文本内容的节点（如 thematicBreak），类型匹配即可
 *
 * @param oldNode - 旧节点。
 * @param newNode - 新节点。
 * @param threshold - 相似度阈值。
 * @param autoMatchCodeLangs - 1:1 code lang 集合。
 * @returns 是否可匹配。
 */
function canNodesMatch(
  oldNode: MdastNode,
  newNode: MdastNode,
  threshold: number,
  autoMatchCodeLangs: Set<string>
): boolean {
  // 类型不同，不可匹配
  if (oldNode.type !== newNode.type) return false

  // 各节点类型的结构属性检查
  switch (oldNode.type) {
    case 'heading':
      if (oldNode.depth !== newNode.depth) return false
      break
    case 'code':
      if (String(oldNode.lang ?? '') !== String(newNode.lang ?? '')) return false
      // 1:1 code lang 直接匹配，跳过相似度检查
      if (autoMatchCodeLangs.has(String(oldNode.lang ?? ''))) return true
      break
    case 'link':
      if (String(oldNode.url ?? '') !== String(newNode.url ?? '')) return false
      break
    case 'image':
      if (String(oldNode.url ?? '') !== String(newNode.url ?? '')) return false
      if (String(oldNode.alt ?? '') !== String(newNode.alt ?? '')) return false
      break
    case 'table':
      if ((oldNode.align as unknown[])?.length !== (newNode.align as unknown[])?.length)
        return false
      break
    case 'list':
      if (oldNode.ordered !== newNode.ordered) return false
      break
  }

  // 无文本内容的节点，类型匹配即可
  const oldText = extractTextFromNode(oldNode)
  const newText = extractTextFromNode(newNode)
  if (oldText.length === 0 && newText.length === 0) return true

  // 计算相似度
  return computeTextSimilarity(oldText, newText) >= threshold
}

/**
 * 使用 LCS + 回溯生成序列 diff 结果。
 *
 * @param oldAst - 旧序列。
 * @param newAst - 新序列。
 * @param config - diff 配置（可选，不传则使用 key 严格匹配）。
 * @param autoMatchCodeLangs - 1:1 code lang 集合（可选）。
 * @returns diff 结果数组。
 */
/**
 * 计算两个可匹配节点的匹配权重（基于文本相似度）。
 *
 * 权重越高表示匹配质量越好，LCS 会优先选择高权重的匹配路径，
 * 避免弱匹配"抢占"强匹配的位置。
 *
 * @param oldNode - 旧节点。
 * @param newNode - 新节点。
 * @param autoMatchCodeLangs - 1:1 code lang 集合。
 * @returns 匹配权重（0~1）。
 */
function computeMatchWeight(
  oldNode: MdastNode,
  newNode: MdastNode,
  autoMatchCodeLangs: Set<string>
): number {
  // 自动匹配的代码块（唯一 lang），给予最高权重
  if (oldNode.type === 'code' && autoMatchCodeLangs.has(String(oldNode.lang ?? ''))) {
    return 1.0
  }
  const oldText = extractTextFromNode(oldNode)
  const newText = extractTextFromNode(newNode)
  if (oldText.length === 0 && newText.length === 0) return 1.0
  return computeTextSimilarity(oldText, newText)
}

function mergeSubsequence<T extends { key: string }>(
  oldAst: T[],
  newAst: T[],
  config?: DiffConfig,
  autoMatchCodeLangs?: Set<string>
): DiffNode<T>[] {
  const dpResult = buildDP(oldAst, newAst, config, autoMatchCodeLangs)
  return backtrackDiff(dpResult, oldAst, newAst, config, autoMatchCodeLangs)
}
/**
 * 构建加权 LCS 动态规划表。
 *
 * 与传统等权 LCS 不同，此处使用文本相似度作为匹配权重，
 * 使算法优先选择高质量匹配，避免弱匹配抢占位置。
 *
 * @param oldAst - 旧序列。
 * @param newAst - 新序列。
 * @param config - diff 配置（可选，不传则使用 key 严格匹配）。
 * @param autoMatchCodeLangs - 1:1 code lang 集合（可选）。
 * @returns 动态规划表和权重矩阵。
 */
function buildDP<T extends { key: string }>(
  oldAst: T[],
  newAst: T[],
  config?: DiffConfig,
  autoMatchCodeLangs?: Set<string>
): { dp: number[][]; weights: number[][] } {
  const m = oldAst.length
  const n = newAst.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  const weights: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  const threshold = config?.similarityThreshold ?? 1.0
  const langs = autoMatchCodeLangs ?? new Set<string>()

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const matched = config
        ? canNodesMatch(
            oldAst[i - 1] as unknown as MdastNode,
            newAst[j - 1] as unknown as MdastNode,
            threshold,
            langs
          )
        : oldAst[i - 1].key === newAst[j - 1].key
      if (matched) {
        const weight = config
          ? computeMatchWeight(
              oldAst[i - 1] as unknown as MdastNode,
              newAst[j - 1] as unknown as MdastNode,
              langs
            )
          : 1
        weights[i][j] = weight
        dp[i][j] = Math.max(dp[i - 1][j - 1] + weight, dp[i - 1][j], dp[i][j - 1])
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  return { dp, weights }
}
/**
 * 根据加权 dp 表从右下角回溯，生成 insert / delete / equal 序列。
 *
 * 回溯时需判断匹配是否被 DP 选中（dp[i][j] == dp[i-1][j-1] + weight），
 * 而非仅判断 canNodesMatch，避免弱匹配被错误采纳。
 *
 * @param dpResult - buildDP 返回的 dp 表和权重矩阵。
 * @param oldAst - 旧序列。
 * @param newAst - 新序列。
 * @param config - diff 配置（可选，不传则使用 key 严格匹配）。
 * @param autoMatchCodeLangs - 1:1 code lang 集合（可选）。
 * @returns 回溯得到的 diff 序列。
 */
function backtrackDiff<T extends { key: string }>(
  dpResult: { dp: number[][]; weights: number[][] },
  oldAst: T[],
  newAst: T[],
  config?: DiffConfig,
  autoMatchCodeLangs?: Set<string>
): DiffNode<T>[] {
  const { dp, weights } = dpResult
  const result: DiffNode<T>[] = []
  let i = oldAst.length
  let j = newAst.length
  const threshold = config?.similarityThreshold ?? 1.0
  const langs = autoMatchCodeLangs ?? new Set<string>()
  const EPS = 1e-9

  while (i > 0 || j > 0) {
    const canMatch =
      i > 0 &&
      j > 0 &&
      (config
        ? canNodesMatch(
            oldAst[i - 1] as unknown as MdastNode,
            newAst[j - 1] as unknown as MdastNode,
            threshold,
            langs
          )
        : oldAst[i - 1].key === newAst[j - 1].key)

    // 仅当 DP 实际选择了该匹配时才走对角线
    if (canMatch && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + weights[i][j])) < EPS) {
      result.unshift({
        ...newAst[j - 1],
        __data: { diffType: 'equal', node: { oldNode: oldAst[i - 1], newNode: newAst[j - 1] } },
      })
      i--
      j--
      continue
    }
    if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1] + EPS)) {
      result.unshift({ ...oldAst[i - 1], __data: { diffType: 'delete' } })
      i--
      continue
    }
    if (j > 0) {
      result.unshift({ ...newAst[j - 1], __data: { diffType: 'insert' } })
      j--
    }
  }
  return result
}
type DiffNode<T> = T & { __data: { diffType: DiffType; node?: { oldNode: T; newNode: T } } }

/**
 * 创建用于接受/拒绝操作的工具栏节点。
 */
/**
 * 创建用于接受/拒绝操作的工具栏节点。
 *
 * @returns HAST 元素节点。
 */
function createToolbar(): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['diff-hunk-toolbar'], role: 'toolbar' },
    children: [
      {
        type: 'element',
        tagName: 'button',
        properties: {
          type: 'button',
          className: ['diff-btn', 'diff-btn-accept'],
          dataAction: 'accept',
        },
        children: [{ type: 'text', value: '接受' }],
      },
      {
        type: 'element',
        tagName: 'button',
        properties: {
          type: 'button',
          className: ['diff-btn', 'diff-btn-reject'],
          dataAction: 'reject',
        },
        children: [{ type: 'text', value: '拒绝' }],
      },
    ],
  }
}
/**
 * 从 HAST 节点中读取 diff 元信息。
 */
/**
 * 从 HAST 节点中读取 diff 元信息。
 *
 * @param node - 目标 HAST 节点。
 * @returns diffId 与 diffType。
 */
function getDiffMeta(node: HastNode): { diffId: string; diffType: string } {
  const props = node.properties as Record<string, unknown> | undefined
  return {
    diffId: String(node.data?.diffId ?? props?.dataDiffId ?? ''),
    diffType: String(node.data?.diffType ?? props?.dataDiffType ?? ''),
  }
}
/**
 * 将需要交互的 diff 节点包裹成可显示工具栏的容器。
 */
/**
 * 将带有 diff 元信息的节点包裹成可交互的 diff 块。
 *
 * @param node - 原始 HAST 节点。
 * @returns 包裹后的 HAST 元素。
 */
function wrapHunk(node: HastNode): Element {
  const { diffId, diffType } = getDiffMeta(node)
  const content: ElementContent = { ...node, data: undefined }
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['diff-hunk', `diff-hunk--${diffType}`], dataDiffId: diffId },
    children: [createToolbar(), content],
  }
}
const WRAPPABLE_TAGS = new Set([
  'p',
  'span',
  'strong',
  'em',
  'code',
  'a',
  'del',
  'ins',
  'text',
  'pre',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'img',
  'div',
])
type HastNode = Element & { data?: { diffId?: string; diffType?: string } }
/**
 * 为渲染后的 HAST 注入 diff 相关的 DOM 结构。
 */
function rehypeDiffAnnotations() {
  /**
   * 不能被 <div> 包裹的标签（如 <tr> 在 <table> 内不能被 <div> 包裹），
   * 对这些标签直接添加 diff CSS 类。
   */
  const DIRECT_ANNOTATE_TAGS = new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'li'])

  return (tree: HastRoot) => {
    visit(tree, 'element', (node: HastNode, index, parent) => {
      if (!parent || index == null) return

      // 特殊处理 <pre>：将子 <code> 的 diff 属性传播到 <pre>
      // 因为 remark-rehype 将 code 节点的 hProperties 放在 <code> 而非 <pre> 上
      // 同时提取语言信息，为代码块添加语言标签
      if (node.tagName === 'pre' && node.children) {
        const codeChild = node.children.find(
          (child): child is HastNode => child.type === 'element' && child.tagName === 'code'
        )
        if (codeChild) {
          const { diffId: preDiffId, diffType: preDiffType } = getDiffMeta(codeChild)
          if (preDiffId && preDiffType && preDiffType !== 'unchanged') {
            if (!node.data) node.data = {}
            node.data.diffId = preDiffId
            node.data.diffType = preDiffType
            if (!node.properties) node.properties = {}
            ;(node.properties as Record<string, unknown>).dataDiffId = preDiffId
            ;(node.properties as Record<string, unknown>).dataDiffType = preDiffType
          }

          // 提取语言信息并添加语言标签
          const codeClasses = (codeChild.properties as Record<string, unknown>)?.className
          const classList = typeof codeClasses === 'string' ? codeClasses.split(/\s+/)
            : Array.isArray(codeClasses) ? codeClasses as string[] : []
          const langClass = classList.find((c: string) => c.startsWith('language-'))
          if (langClass) {
            const lang = langClass.replace('language-', '')
            // 在 <pre> 内最前面插入语言标签
            const labelNode: HastNode = {
              type: 'element',
              tagName: 'span',
              properties: { className: ['code-lang-label'] },
              children: [{ type: 'text', value: lang }],
            } as unknown as HastNode
            node.children = [labelNode, ...node.children]
          }
        }
      }

      const { diffId, diffType } = getDiffMeta(node)
      if (!diffType || diffType === 'unchanged') return

      // 不能被 <div> 包裹的标签：直接添加 diff CSS 类
      if (DIRECT_ANNOTATE_TAGS.has(node.tagName)) {
        const cls = diffType === 'insert' ? 'diff-hunk--insert'
          : diffType === 'delete' ? 'diff-hunk--delete'
          : 'diff-hunk--modified'
        if (!node.properties) node.properties = {}
        const existing = (node.properties as Record<string, unknown>).className
        const classes = typeof existing === 'string' ? existing.split(/\s+/) : Array.isArray(existing) ? existing as string[] : []
        if (!classes.includes(cls)) classes.push(cls)
        ;(node.properties as Record<string, unknown>).className = classes
        return
      }

      // 根层级元素：用 <div> 包裹并添加工具栏
      if (parent !== tree) return

      if (!diffId) return
      if (!WRAPPABLE_TAGS.has(node.tagName)) return
      parent.children[index] = wrapHunk(node)
    })
  }
}
