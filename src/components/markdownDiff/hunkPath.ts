import type { Root } from 'mdast'
import type { MdastNode } from './types'

/**
 * 参与相似度 / LCS 计算的最大字符数。
 * 超出部分截断，避免长文档触发 O(n²) 字符 DP 导致卡顿。
 */
export const MAX_SIMILARITY_TEXT_LENGTH = 2000

/**
 * 为 hunk 生成稳定 ID：路径 + 类型 + 节点结构 key 的哈希。
 * 初次 merge 时注册；working 模式下 resolve 后从 pending 移除，不再依赖 id 跨重算对齐。
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
 * 供 merge 构建阶段使用；working 模式 resolve 请用 {@link locateHunkInMdast}。
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
