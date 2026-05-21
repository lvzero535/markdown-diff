import type { Root } from 'mdast'
import type { DiffHunk, HunkResolveConfig, HunkResolveTarget, MdastNode } from './types'
import { DEFAULT_HUNK_RESOLVE } from './types'

/**
 * 参与相似度 / LCS 计算的最大字符数。
 * 超出部分截断，避免长文档触发 O(n²) 字符 DP 导致卡顿。
 */
export const MAX_SIMILARITY_TEXT_LENGTH = 2000

/**
 * 为 hunk 生成稳定 ID：路径 + 类型 + 节点结构 key 的哈希。
 * resolve 后全文重算时，同一逻辑位置在结构未变时 id 保持一致（便于测试与状态追踪）。
 */
export function createStableHunkId(
  path: number[],
  diffType: string,
  node?: MdastNode
): string {
  const pathKey = path.length ? path.join('.') : 'root'
  const typePart = node?.type ?? 'unknown'
  const sig = node ? nodeStructureSignature(node) : ''
  return `${diffType}-${pathKey}-${hashString(`${typePart}|${sig}`)}`
}

/** 合并用户配置与默认值 */
export function normalizeHunkResolveConfig(
  partial?: HunkResolveConfig
): Required<HunkResolveConfig> {
  return { ...DEFAULT_HUNK_RESOLVE, ...partial }
}

/** 将 `both` 展开为要写入的文档侧 */
export function expandHunkResolveTarget(target: HunkResolveTarget): ('old' | 'new')[] {
  if (target === 'both') return ['old', 'new']
  return [target]
}

/** 提取用于 ID 的节点结构签名（不含正文差异） */
function nodeStructureSignature(node: MdastNode): string {
  const parts = [node.type]
  if (node.type === 'heading') parts.push(`d${node.depth}`)
  if (node.type === 'code') parts.push(String(node.lang ?? ''))
  if (node.type === 'link') parts.push(String(node.url ?? ''))
  return parts.join('|')
}

/** 简易字符串哈希（FNV-1a 变体），用于 hunk id 后缀 */
function hashString(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/**
 * 在 AST 中按路径定位：返回「直接持有目标节点的 children 数组」及下标。
 */
export function locateInAst(
  root: Root,
  path: number[]
): { parentChildren: MdastNode[]; index: number } | null {
  if (path.length === 0) return null

  let current = (root.children ?? []) as MdastNode[]

  for (let depth = 0; depth < path.length - 1; depth++) {
    const seg = path[depth]
    if (!Number.isInteger(seg) || seg < 0 || seg >= current.length) return null
    const next = current[seg]?.children as MdastNode[] | undefined
    if (!Array.isArray(next)) return null
    current = next
  }

  const index = path[path.length - 1]
  if (!Number.isInteger(index) || index < 0 || index >= current.length) {
    if (Number.isInteger(index) && index >= 0 && index === current.length) {
      return { parentChildren: current, index }
    }
    return null
  }

  return { parentChildren: current, index }
}

/** 深拷贝 AST（JSON） */
export function cloneAst<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T
}

/**
 * 在指定 AST 的某一侧应用 hunk。
 *
 * | action | old 侧 | new 侧 |
 * |--------|--------|--------|
 * | accept | 向新版本对齐 | 确认新版本（modified 写 newNode） |
 * | reject | 保持旧版本（modified 写 oldNode） | 回退到旧版本 |
 */
export function applyHunkToAst(
  ast: Root,
  hunk: DiffHunk,
  action: 'accept' | 'reject',
  side: 'old' | 'new'
): Root {
  const result = cloneAst(ast)
  const path = side === 'old' ? [...hunk.oldPath] : [...hunk.path]
  const isAccept = action === 'accept'
  const isReject = action === 'reject'

  switch (hunk.diffType) {
    case 'insert': {
      if (side === 'old') {
        if (isAccept && hunk.newNode) {
          spliceAtPath(result, path, 'insert', cloneAst(hunk.newNode))
        }
      } else if (isReject) {
        spliceAtPath(result, path, 'remove')
      }
      break
    }
    case 'delete': {
      if (side === 'old') {
        if (isAccept) {
          spliceAtPath(result, path, 'remove')
        }
      } else if (isReject && hunk.oldNode) {
        spliceAtPath(result, path, 'insert', cloneAst(hunk.oldNode))
      }
      break
    }
    case 'modified': {
      const located = locateInAst(result, path)
      if (!located) break
      const { parentChildren, index } = located
      if (isAccept && hunk.newNode) {
        parentChildren[index] = cloneAst(hunk.newNode)
      } else if (isReject && hunk.oldNode) {
        parentChildren[index] = cloneAst(hunk.oldNode)
      }
      break
    }
    default:
      break
  }

  return result
}

/**
 * 按配置在 old/new 两侧应用 accept 或 reject。
 */
export function applyHunkToBothSides(
  oldAst: Root,
  newAst: Root,
  hunk: DiffHunk,
  action: 'accept' | 'reject',
  resolveConfig?: HunkResolveConfig
): { oldAst: Root; newAst: Root } {
  const cfg = normalizeHunkResolveConfig(resolveConfig)
  const target = action === 'accept' ? cfg.onAccept : cfg.onReject
  const sides = expandHunkResolveTarget(target)

  let nextOld = oldAst
  let nextNew = newAst
  for (const side of sides) {
    if (side === 'old') {
      nextOld = applyHunkToAst(nextOld, hunk, action, 'old')
    } else {
      nextNew = applyHunkToAst(nextNew, hunk, action, 'new')
    }
  }
  return { oldAst: nextOld, newAst: nextNew }
}

type SpliceOp = 'insert' | 'remove'

function spliceAtPath(
  root: Root,
  path: number[],
  op: SpliceOp,
  nodeToInsert?: MdastNode
): void {
  if (path.length === 0) return

  const parentPath = path.slice(0, -1)
  const lastIndex = path[path.length - 1]

  let parentChildren: MdastNode[]
  if (parentPath.length === 0) {
    if (!root.children) root.children = []
    parentChildren = root.children as MdastNode[]
  } else {
    const parentLoc = locateInAst(root, parentPath)
    if (!parentLoc) return
    const parentNode = parentLoc.parentChildren[parentLoc.index]
    if (!parentNode.children) parentNode.children = []
    parentChildren = parentNode.children as MdastNode[]
  }

  if (op === 'insert' && nodeToInsert) {
    const idx = Math.min(Math.max(0, lastIndex), parentChildren.length)
    parentChildren.splice(idx, 0, nodeToInsert)
  } else if (op === 'remove') {
    if (lastIndex >= 0 && lastIndex < parentChildren.length) {
      parentChildren.splice(lastIndex, 1)
    }
  }
}

/** @deprecated 请使用 locateInAst */
export function findNodeByPath(nodes: MdastNode[], path: number[]): number | null {
  if (!path.length) return null
  const fakeRoot = { type: 'root', children: nodes } as unknown as Root
  const loc = locateInAst(fakeRoot, path)
  return loc?.index ?? null
}
