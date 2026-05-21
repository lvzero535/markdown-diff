import type { Root } from 'mdast'

/** 通用 mdast 节点（含自定义 diff 字段） */
export type MdastNode = { type: string; [key: string]: unknown }

/** 合并后的 mdast 根（children 可能含 diff 元数据） */
export type MergedMdastRoot = Root & { children: MdastNode[] }

/** 单个可交互差异块 */
export type DiffHunk = {
  id: string
  diffType: 'insert' | 'delete' | 'modified'
  /** 在 new 文档中定位用的末级下标（兼容字段） */
  index: number
  /** 在 new 文档中从 root 到目标节点的下标路径 */
  path: number[]
  /** 在 old 文档中定位用的末级下标（兼容字段） */
  oldIndex: number
  /** 在 old 文档中从 root 到目标节点的下标路径 */
  oldPath: number[]
  oldNode?: MdastNode
  newNode?: MdastNode
}

export type MergedResult = {
  mdast: MergedMdastRoot
  hunks: Map<string, DiffHunk>
}

/**
 * 接受/拒绝某个 hunk 时，要更新哪一侧 Markdown。
 * - old：仅旧稿
 * - new：仅新稿
 * - both：两侧都按该操作的结果写入（使该 hunk 在两侧立即一致）
 */
export type HunkResolveTarget = 'old' | 'new' | 'both'

/**
 * hunk 接受/拒绝时的更新策略（可配置，任务 #4）。
 *
 * 默认（classic）：接受 → 改 old；拒绝 → 改 new。
 */
export type HunkResolveConfig = {
  /** 点击「接受」时更新哪一侧，默认 `old` */
  onAccept?: HunkResolveTarget
  /** 点击「拒绝」时更新哪一侧，默认 `new` */
  onReject?: HunkResolveTarget
}

/** 默认策略：接受改旧稿，拒绝改新稿 */
export const DEFAULT_HUNK_RESOLVE: Required<HunkResolveConfig> = {
  onAccept: 'old',
  onReject: 'new',
}

/** 常用预设，可直接传给 `diffConfig.hunkResolve` */
export const HUNK_RESOLVE_PRESETS = {
  /** 接受 → old；拒绝 → new（默认） */
  classic: { onAccept: 'old', onReject: 'new' } satisfies HunkResolveConfig,
  /** 接受/拒绝均同时更新两侧 */
  syncBoth: { onAccept: 'both', onReject: 'both' } satisfies HunkResolveConfig,
  /** 接受 → new；拒绝 → old（与默认相反） */
  mirror: { onAccept: 'new', onReject: 'old' } satisfies HunkResolveConfig,
} as const

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
  /** 接受/拒绝 hunk 时更新 old/new 的策略，见 {@link HunkResolveConfig} */
  hunkResolve?: HunkResolveConfig
}

/** 构建子级 hunk 时的路径上下文 */
export type HunkBuildContext = {
  hunks: Map<string, DiffHunk>
  /** 当前节点在 new 文档 AST 中的路径 */
  newPath: number[]
  /** 当前节点在 old 文档 AST 中的路径 */
  oldPath: number[]
}
