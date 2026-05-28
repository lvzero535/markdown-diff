import type { Root } from 'mdast'

/** 通用 mdast 节点（含自定义 diff 字段） */
export type MdastNode = { type: string; [key: string]: unknown }

/** 合并后的 mdast 根（children 可能含 diff 元数据） */
export type MergedMdastRoot = Root & { children: MdastNode[] }

/**
 * 单个可交互差异块。
 *
 * Working 模式下 resolve 时主要使用 `id`、`diffType`、`oldNode`、`newNode` 快照；
 * `path` / `oldPath` 仅在 `buildMergedMdast` 注册阶段使用。
 */
export type DiffHunk = {
  id: string
  diffType: 'insert' | 'delete' | 'modified'
  /** 在 new 文档中定位用的末级下标（构建期） */
  index: number
  /** 在 new 文档中从 root 到目标节点的下标路径（构建期） */
  path: number[]
  /** 在 old 文档中定位用的末级下标（构建期） */
  oldIndex: number
  /** 在 old 文档中从 root 到目标节点的下标路径（构建期） */
  oldPath: number[]
  /** 拒绝时还原用的旧稿节点快照 */
  oldNode?: MdastNode
  /** 接受时写入的新稿节点快照 */
  newNode?: MdastNode
}

export type MergedResult = {
  mdast: MergedMdastRoot
  hunks: Map<string, DiffHunk>
}

/** diff 匹配配置 */
export type DiffConfig = {
  /** 块级内容相似度阈值（0~1），默认 0.35 */
  similarityThreshold: number
  /**
   * 表头 fuzzy 匹配阈值（0~1），默认 0.85。
   * 表头文本相似度达到该值时视为同一列（列重命名场景）。
   */
  headerSimilarityThreshold?: number
  /**
   * 参与相似度/LCS 的最大字符数，默认 2000。
   * 超出部分截断以降低 O(n²) 开销。
   */
  maxSimilarityTextLength?: number
}

/** 构建子级 hunk 时的路径上下文 */
export type HunkBuildContext = {
  hunks: Map<string, DiffHunk>
  /** 当前节点在 new 文档 AST 中的路径 */
  newPath: number[]
  /** 当前节点在 old 文档 AST 中的路径 */
  oldPath: number[]
}
