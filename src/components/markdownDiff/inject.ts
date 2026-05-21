import type { InjectionKey } from 'vue'
import type { UseMarkdownDiffReturn } from './useMarkdownDiff'

/**
 * 父级（如 App）通过 provide 共享 diff 计算结果，避免与 MarkdownDiff 重复 parse（任务 #6）。
 */
export const markdownDiffKey: InjectionKey<UseMarkdownDiffReturn> = Symbol('markdownDiff')
