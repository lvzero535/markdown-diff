/**
 * markdown-diff 组件统一入口
 *
 * 其他项目只需从此目录导入即可使用全部功能：
 * - MarkdownDiff Vue 组件
 * - useMarkdownDiff composable
 * - diff 工具函数
 * - 类型定义
 * - Vue 插件
 *
 * @example
 * ```ts
 * // 使用 Vue 组件
 * import { MarkdownDiff } from 'markdown-diff'
 *
 * // 使用 composable
 * import { useMarkdownDiff } from 'markdown-diff'
 *
 * // 使用工具函数
 * import { parseMarkdown, buildMergedMdast, renderMdastToHtml } from 'markdown-diff'
 * ```
 */

// ==================== Vue 组件 ====================
export { default as MarkdownDiff } from './MarkdownDiff.vue'

// ==================== Composable ====================
export { useMarkdownDiff } from './useMarkdownDiff'
export { markdownDiffKey } from './inject'

// ==================== 工具函数 ====================
export {
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  applyHunk,
  resolveHunk,
  resolveHunkOnAsts,
  applyHunkResolution,
  applyHunkAcceptOnOldAst,
  mdastToMarkdown,
  diffText,
  extractFormattedText,
} from './markdownDiff'

export {
  normalizeHunkResolveConfig,
  expandHunkResolveTarget,
  applyHunkToBothSides,
} from './hunkPath'

export type { HunkResolvedPayload } from './useMarkdownDiff'

// ==================== 类型定义 ====================
export type {
  DiffHunk,
  MergedResult,
  DiffConfig,
  MdastNode,
  MergedMdastRoot,
  HunkBuildContext,
  HunkResolveConfig,
  HunkResolveTarget,
} from './types'

export { DEFAULT_HUNK_RESOLVE, HUNK_RESOLVE_PRESETS } from './types'

export type { DiffMode } from './markdownDiff'

// ==================== Vue 插件 ====================
import type { App, Plugin } from 'vue'
import MarkdownDiff from './MarkdownDiff.vue'

/**
 * Vue 插件，注册 MarkdownDiff 为全局组件。
 *
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { MarkdownDiffPlugin } from 'markdown-diff'
 *
 * const app = createApp(App)
 * app.use(MarkdownDiffPlugin)
 * // 之后在模板中直接使用 <MarkdownDiff />
 * ```
 */
export const MarkdownDiffPlugin: Plugin = {
  install(app: App) {
    app.component('MarkdownDiff', MarkdownDiff)
  },
}
