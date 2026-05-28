/**
 * markdown-diff 组件统一入口
 */

export { default as MarkdownDiff } from './MarkdownDiff.vue'

export { useMarkdownDiff } from './useMarkdownDiff'
export { markdownDiffKey } from './inject'

export {
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  mdastToMarkdown,
  diffText,
  extractFormattedText,
} from './markdownDiff'

export {
  applyHunkToWorkingMdast,
  workingMdastToMarkdown,
  locateHunkInMdast,
  stripDiffMeta,
} from './workingHunk'

export { createStableHunkId, cloneAst, locateInAst } from './hunkPath'

export type { HunkResolvedPayload } from './useMarkdownDiff'

export type {
  DiffHunk,
  MergedResult,
  DiffConfig,
  MdastNode,
  MergedMdastRoot,
  HunkBuildContext,
} from './types'

export type { DiffMode } from './markdownDiff'

import type { App, Plugin } from 'vue'
import MarkdownDiff from './MarkdownDiff.vue'

export const MarkdownDiffPlugin: Plugin = {
  install(app: App) {
    app.component('MarkdownDiff', MarkdownDiff)
  },
}
