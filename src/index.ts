/**
 * markdown-diff 项目入口
 */
export {
  MarkdownDiff,
  useMarkdownDiff,
  MarkdownDiffPlugin,
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  mdastToMarkdown,
  applyHunkToWorkingMdast,
  workingMdastToMarkdown,
  diffText,
  extractFormattedText,
} from './components/markdownDiff'

export type {
  DiffHunk,
  MergedResult,
  DiffConfig,
  MdastNode,
  DiffMode,
  HunkResolvedPayload,
} from './components/markdownDiff'
