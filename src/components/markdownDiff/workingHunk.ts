/**
 * 单稿 Working 模式下的 hunk 解析。
 *
 * 与旧双稿方案的区别：
 * - 旧方案在 old/new 两份独立 AST 上按 path/oldPath 写入，再全量重算 diff。
 * - 本模块只在「合并展示树」上 patch：接受 = 采纳 newNode 快照，拒绝 = 采纳 oldNode 快照。
 * - 通过 hunk.id（data.diffId）定位节点，避免 merged children 下标与 newAst 下标不一致。
 */

import type { Root } from 'mdast'
import { mdastToMarkdown } from './markdownDiff'
import { cloneAst } from './hunkPath'
import type { DiffHunk, MdastNode, MergedMdastRoot } from './types'

/** 在展示树中定位 hunk 对应节点的结果 */
export type HunkLocation = {
  parentChildren: MdastNode[]
  index: number
  node: MdastNode
}

/**
 * 读取节点上注册的 diff 块 id（与 {@link annotateNode} 写入的字段一致）。
 */
function getNodeDiffId(node: MdastNode): string | undefined {
  const data = node.data as
    | { diffId?: string; hProperties?: { dataDiffId?: string } }
    | undefined
  const fromData = data?.diffId
  if (typeof fromData === 'string' && fromData.length > 0) return fromData
  const fromProps = data?.hProperties?.dataDiffId
  if (typeof fromProps === 'string' && fromProps.length > 0) return fromProps
  return undefined
}

/**
 * 在 working / merged 展示树中按 hunk id 深度优先查找。
 *
 * @param root - 当前 working 根节点
 * @param hunkId - {@link DiffHunk.id}，与节点 `data.diffId` 一致
 */
export function locateHunkInMdast(root: Root, hunkId: string): HunkLocation | null {
  const children = (root.children ?? []) as MdastNode[]
  return locateInChildren(children, hunkId)
}

function locateInChildren(parentChildren: MdastNode[], hunkId: string): HunkLocation | null {
  for (let index = 0; index < parentChildren.length; index++) {
    const node = parentChildren[index]
    if (getNodeDiffId(node) === hunkId) {
      return { parentChildren, index, node }
    }
    const childList = node.children as MdastNode[] | undefined
    if (Array.isArray(childList)) {
      const nested = locateInChildren(childList, hunkId)
      if (nested) return nested
    }
  }
  return null
}

/**
 * 去掉 diff 标注元数据，得到可序列化 / 可替换的纯 mdast 子树。
 */
export function stripDiffMeta(node: MdastNode): MdastNode {
  const { key, __data, data, ...rest } = node as MdastNode & {
    key?: string
    __data?: unknown
    data?: unknown
  }
  const result: MdastNode = { ...rest }
  if (Array.isArray(result.children)) {
    result.children = (result.children as MdastNode[]).map(stripDiffMeta)
  }
  return result
}

/**
 * 在 working 展示树上应用单个 hunk（原地修改）。
 *
 * | diffType | accept（用户采纳变更） | reject（用户保留旧内容） |
 * |----------|------------------------|------------------------|
 * | insert   | 保留块并去掉红绿标记   | 从树中移除该新增块     |
 * | delete   | 从树中移除待删块       | 还原为 oldNode 并去标  |
 * | modified | 替换为 newNode         | 替换为 oldNode         |
 *
 * @param working - 内存中唯一的 working 根（会被原地修改）
 * @param hunk - 待处理差异块（含 oldNode/newNode 快照）
 * @param action - `accept` 或 `reject`
 */
export function applyHunkToWorkingMdast(
  working: MergedMdastRoot,
  hunk: DiffHunk,
  action: 'accept' | 'reject'
): void {
  const located = locateHunkInMdast(working, hunk.id)
  if (!located) return

  const { parentChildren, index } = located
  const isAccept = action === 'accept'
  const isReject = action === 'reject'

  switch (hunk.diffType) {
    case 'insert': {
      if (isAccept) {
        const content = hunk.newNode ? stripDiffMeta(cloneAst(hunk.newNode)) : stripDiffMeta(located.node)
        parentChildren[index] = content
      } else if (isReject) {
        parentChildren.splice(index, 1)
      }
      break
    }
    case 'delete': {
      if (isAccept) {
        parentChildren.splice(index, 1)
      } else if (isReject && hunk.oldNode) {
        parentChildren[index] = stripDiffMeta(cloneAst(hunk.oldNode))
      }
      break
    }
    case 'modified': {
      if (isAccept && hunk.newNode) {
        parentChildren[index] = stripDiffMeta(cloneAst(hunk.newNode))
      } else if (isReject && hunk.oldNode) {
        parentChildren[index] = stripDiffMeta(cloneAst(hunk.oldNode))
      }
      break
    }
    default:
      break
  }
}

/**
 * 将单个 `diff` 行内节点转为可序列化的 mdast（导出用）。
 * - delete：丢弃
 * - insert：优先还原 originalNode（保留 strong/code 等），否则退化为纯 text
 */
function normalizeDiffLeaf(node: MdastNode): MdastNode | null {
  const dt = node.diffType as string | undefined
  if (dt === 'delete') return null
  const originalNode = node.originalNode as MdastNode | undefined
  if (originalNode) return normalizeNodeForExport(originalNode)
  const value = String(node.value ?? '')
  return value ? { type: 'text', value } : null
}

/**
 * 递归清理子节点列表：展开 `diff`、处理嵌套容器。
 */
function normalizeChildrenForExport(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = []
  for (const child of children) {
    if (child.type === 'diff') {
      const normalized = normalizeDiffLeaf(child)
      if (normalized) out.push(normalized)
      continue
    }
    out.push(normalizeNodeForExport(child))
  }
  return out
}

/**
 * 将展示树节点还原为 remark 可序列化的标准 mdast。
 * 处理：`diff` 行内节点、`*-diff` 包装类型、带 diff 子节点的普通 paragraph 等。
 */
function normalizeNodeForExport(node: MdastNode): MdastNode {
  const type = node.type

  if (type === 'diff') {
    return normalizeDiffLeaf(node) ?? { type: 'text', value: '' }
  }

  if (type.endsWith('-diff')) {
    const baseType = type.slice(0, -'-diff'.length)
    const children = Array.isArray(node.children)
      ? normalizeChildrenForExport(node.children as MdastNode[])
      : undefined
    return stripDiffMeta({
      ...node,
      type: baseType,
      ...(children ? { children } : {}),
    })
  }

  if (Array.isArray(node.children)) {
    return stripDiffMeta({
      ...node,
      children: normalizeChildrenForExport(node.children as MdastNode[]),
    })
  }

  return stripDiffMeta(node)
}

/**
 * 将当前 working 树序列化为最终 Markdown 字符串。
 *
 * 会清理 diff 标注与 `*-diff` 包装，使 remark 序列化器能识别节点类型。
 * 未处理的 hunk 仍按「当前树中可见内容」导出（含待审阅的 insert/delete 块）。
 *
 * @param working - 已部分或全部 resolve 的 working 根
 */
export function workingMdastToMarkdown(working: MergedMdastRoot): string {
  const cleaned = {
    type: 'root',
    children: ((working.children ?? []) as MdastNode[]).map(normalizeNodeForExport),
  } as Root
  return mdastToMarkdown(cleaned)
}
