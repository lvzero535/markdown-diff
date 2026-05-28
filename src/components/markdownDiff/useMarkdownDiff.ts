/**
 * Markdown diff 组合式 API（单稿 Working 模式）。
 *
 * 数据流：
 * 1. 初次：oldMarkdown + newMarkdown → buildMergedMdast → workingMdast + pendingHunks → html
 * 2. 用户 accept/reject：patch workingMdast → 从 pending 移除 → 重渲染 html → 更新 finalMarkdown
 * 3. old/new 变更：整轮 resetFromSources（重新 diff），不保留上一轮 working 修改
 *
 * 不通过 props 回流 old/new，避免双稿竞态与全量重算。
 */

import { computed, ref, shallowRef, watch } from 'vue'
import { parseMarkdown, buildMergedMdast, renderMdastToHtml } from './markdownDiff'
import { cloneAst } from './hunkPath'
import { applyHunkToWorkingMdast, workingMdastToMarkdown } from './workingHunk'
import type { DiffHunk, DiffConfig, MergedMdastRoot } from './types'

/** 单个 hunk 处理完成后向父组件回传的事件载荷 */
export type HunkResolvedPayload = {
  hunk: DiffHunk
  action: 'accept' | 'reject'
  /** 当前 working 树序列化后的定稿 Markdown */
  finalMarkdown: string
}

export function useMarkdownDiff(
  oldMarkdown: () => string,
  newMarkdown: () => string,
  config?: (() => Partial<DiffConfig> | undefined) | Partial<DiffConfig>
) {
  const resolveConfig = (): Partial<DiffConfig> | undefined => {
    if (typeof config === 'function') return config()
    return config
  }

  /** 内存中唯一的可变展示/定稿树 */
  const workingMdast = shallowRef<MergedMdastRoot | null>(null)
  /** 尚未 accept/reject 的 hunk 索引 */
  const pendingHunks = shallowRef<Map<string, DiffHunk>>(new Map())
  const html = shallowRef('')
  const finalMarkdown = ref('')

  let htmlDebounceTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * 根据当前 working 树刷新 v-html 与 finalMarkdown。
   * Phase 1 全页重渲染；后续可改为按 data-diff-id 局部更新。
   */
  function syncView() {
    const root = workingMdast.value
    if (!root) {
      html.value = ''
      finalMarkdown.value = ''
      return
    }
    finalMarkdown.value = workingMdastToMarkdown(root)
    if (htmlDebounceTimer) clearTimeout(htmlDebounceTimer)
    htmlDebounceTimer = setTimeout(() => {
      html.value = renderMdastToHtml(root)
    }, 120)
  }

  /**
   * old/new 变化时：重新 parse + merge，重置 working 与 pending。
   */
  function resetFromSources() {
    const oldAst = parseMarkdown(oldMarkdown())
    const newAst = parseMarkdown(newMarkdown())
    const { mdast, hunks } = buildMergedMdast(oldAst, newAst, resolveConfig())
    workingMdast.value = cloneAst(mdast) as MergedMdastRoot
    pendingHunks.value = new Map(hunks)
    syncView()
  }

  watch([oldMarkdown, newMarkdown], resetFromSources, { immediate: true })

  /**
   * 在 working 树上处理单个 hunk，并同步视图与 finalMarkdown。
   */
  function resolveAction(hunk: DiffHunk, action: 'accept' | 'reject'): HunkResolvedPayload {
    const root = workingMdast.value
    if (!root) {
      return { hunk, action, finalMarkdown: finalMarkdown.value }
    }
    applyHunkToWorkingMdast(root, hunk, action)
    const nextPending = new Map(pendingHunks.value)
    nextPending.delete(hunk.id)
    pendingHunks.value = nextPending
    syncView()
    return { hunk, action, finalMarkdown: finalMarkdown.value }
  }

  function getFinalMarkdown(): string {
    return finalMarkdown.value
  }

  return {
    html,
    finalMarkdown,
    getFinalMarkdown,
    hunks: computed(() => pendingHunks.value),
    workingMdast,
    pendingHunks,
    resolveAction,
    resetFromSources,
  }
}

export type UseMarkdownDiffReturn = ReturnType<typeof useMarkdownDiff>
