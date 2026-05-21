import { computed, shallowRef, watch } from 'vue'
import {
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  resolveHunk,
  mdastToMarkdown,
} from './markdownDiff'
import type { DiffHunk, DiffConfig, MergedMdastRoot, HunkResolveConfig } from './types'
import { normalizeHunkResolveConfig } from './hunkPath'

/** hunk 处理完成后向父组件回传的事件载荷 */
export type HunkResolvedPayload = {
  hunk: DiffHunk
  action: 'accept' | 'reject'
  oldMarkdown?: string
  newMarkdown?: string
}

/**
 * useMarkdownDiff composable
 */
export function useMarkdownDiff(
  oldMarkdown: () => string,
  newMarkdown: () => string,
  config?: (() => Partial<DiffConfig> | undefined) | Partial<DiffConfig>
) {
  const resolveConfig = (): Partial<DiffConfig> | undefined => {
    if (typeof config === 'function') return config()
    return config
  }

  const hunkResolve = (): HunkResolveConfig | undefined => resolveConfig()?.hunkResolve

  const oldAst = computed(() => parseMarkdown(oldMarkdown()))
  const newAst = computed(() => parseMarkdown(newMarkdown()))

  const merged = computed(() =>
    buildMergedMdast(oldAst.value, newAst.value, resolveConfig())
  )

  const html = shallowRef('')
  let htmlDebounceTimer: ReturnType<typeof setTimeout> | undefined

  watch(
    () => merged.value.mdast,
    (mdast) => {
      if (htmlDebounceTimer) clearTimeout(htmlDebounceTimer)
      htmlDebounceTimer = setTimeout(() => {
        html.value = renderMdastToHtml(mdast as MergedMdastRoot)
      }, 120)
    },
    { immediate: true }
  )

  /**
   * 按 `diffConfig.hunkResolve` 解析 hunk，返回需要写回的 Markdown。
   */
  function resolveAction(
    hunk: DiffHunk,
    action: 'accept' | 'reject'
  ): HunkResolvedPayload {
    const result = resolveHunk(
      oldAst.value,
      newAst.value,
      hunk,
      action,
      hunkResolve()
    )
    return { hunk, action, ...result }
  }

  /** @deprecated 请使用 resolveAction；仅按当前策略返回 old 侧文本 */
  function accept(hunk: DiffHunk): string {
    const cfg = normalizeHunkResolveConfig(hunkResolve())
    const result = resolveHunk(oldAst.value, newAst.value, hunk, 'accept', cfg)
    return result.oldMarkdown ?? mdastToMarkdown(oldAst.value)
  }

  /** @deprecated 请使用 resolveAction；仅按当前策略返回 new 侧文本 */
  function reject(hunk: DiffHunk): string {
    const cfg = normalizeHunkResolveConfig(hunkResolve())
    const result = resolveHunk(oldAst.value, newAst.value, hunk, 'reject', cfg)
    return result.newMarkdown ?? mdastToMarkdown(newAst.value)
  }

  return {
    html,
    hunks: computed(() => merged.value.hunks),
    merged,
    oldAst,
    newAst,
    resolveAction,
    accept,
    reject,
    /** 当前生效的 hunk 解析策略（只读） */
    hunkResolveConfig: computed(() => normalizeHunkResolveConfig(hunkResolve())),
  }
}

export type UseMarkdownDiffReturn = ReturnType<typeof useMarkdownDiff>
