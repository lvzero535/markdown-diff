/**
 * markdown-diff 项目入口
 *
 * 从 markdownDiff 组件目录统一导出所有功能。
 */
export {
  MarkdownDiff,
  useMarkdownDiff,
  MarkdownDiffPlugin,
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  applyHunkResolution,
  applyHunkAcceptOnOldAst,
  mdastToMarkdown,
  diffText,
  extractFormattedText,
} from './components/markdownDiff'

export type {
  DiffHunk,
  MergedResult,
  DiffConfig,
  MdastNode,
  DiffMode,
} from './components/markdownDiff'
