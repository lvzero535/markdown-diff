import { computed, ref, watch } from 'vue'
import {
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  applyHunkResolution,
  applyHunkAcceptOnOldAst,
  mdastToMarkdown,
} from './markdownDiff'
import type { DiffHunk, DiffConfig } from './markdownDiff'

/**
 * useMarkdownDiff composable
 *
 * 封装 Markdown Diff 的核心逻辑，供非组件场景或自定义组件使用。
 *
 * @example
 * ```vue
 * <script setup>
 * import { useMarkdownDiff } from 'markdown-diff'
 *
 * const oldMd = ref('# Hello\n\nWorld')
 * const newMd = ref('# Hi\n\nWorld')
 *
 * const { html, hunks, accept, reject } = useMarkdownDiff(oldMd, newMd)
 * </script>
 *
 * <template>
 *   <div v-html="html" @click="onContentClick" />
 * </template>
 * ```
 *
 * @param oldMarkdown - 旧版本 Markdown 文本（ref 或 getter）
 * @param newMarkdown - 新版本 Markdown 文本（ref 或 getter）
 * @param config - diff 配置（可选）
 * @returns 响应式的 diff 结果和操作方法
 */
export function useMarkdownDiff(
  oldMarkdown: () => string,
  newMarkdown: () => string,
  config?: Partial<DiffConfig>
) {
  const hunksRef = ref<Map<string, DiffHunk>>(new Map())

  const merged = computed(() => {
    const oldAst = parseMarkdown(oldMarkdown())
    const newAst = parseMarkdown(newMarkdown())
    return buildMergedMdast(oldAst, newAst, config)
  })

  watch(
    merged,
    (m) => {
      hunksRef.value = m.hunks
    },
    { immediate: true }
  )

  const html = computed(() =>
    renderMdastToHtml(merged.value.mdast as Parameters<typeof renderMdastToHtml>[0])
  )

  /**
   * 接受某个 diff hunk 的变更，更新 oldMarkdown。
   *
   * @param hunk - 要接受的差异块
   * @returns 新的 oldMarkdown 文本
   */
  function accept(hunk: DiffHunk): string {
    const oldAst = parseMarkdown(oldMarkdown())
    const patchedOld = applyHunkAcceptOnOldAst(oldAst, hunk)
    return mdastToMarkdown(patchedOld)
  }

  /**
   * 拒绝某个 diff hunk 的变更，更新 newMarkdown。
   *
   * @param hunk - 要拒绝的差异块
   * @returns 新的 newMarkdown 文本
   */
  function reject(hunk: DiffHunk): string {
    const newAst = parseMarkdown(newMarkdown())
    const patched = applyHunkResolution(newAst, hunk, 'reject')
    return mdastToMarkdown(patched)
  }

  return {
    /** 渲染后的 HTML 字符串（带 diff 标记） */
    html,
    /** 当前所有 diff hunks 的映射 */
    hunks: hunksRef,
    /** 合并后的 AST 和 hunks */
    merged,
    /** 接受变更，返回新的 oldMarkdown */
    accept,
    /** 拒绝变更，返回新的 newMarkdown */
    reject,
  }
}
