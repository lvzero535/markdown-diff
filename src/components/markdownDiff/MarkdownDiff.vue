<script setup lang="ts">
import { inject } from 'vue'
import { useMarkdownDiff } from './useMarkdownDiff'
import { markdownDiffKey } from './inject'
import type { DiffConfig } from './types'
import type { HunkResolvedPayload, UseMarkdownDiffReturn } from './useMarkdownDiff'

/**
 * MarkdownDiff 组件属性。
 *
 * 接受/拒绝更新哪一侧由 `diffConfig.hunkResolve` 配置（默认：接受→old，拒绝→new）。
 * 预设见 `HUNK_RESOLVE_PRESETS`（如 `syncBoth` 同时更新两侧）。
 */
const props = withDefaults(
  defineProps<{
    oldMarkdown: string
    newMarkdown: string
    /** diff 算法配置，如 similarityThreshold（任务 #8） */
    diffConfig?: Partial<DiffConfig>
  }>(),
  {}
)

const emit = defineEmits<{
  'update:oldMarkdown': [value: string]
  'update:newMarkdown': [value: string]
  /** 单个 hunk 处理完成时触发，便于父组件做审计或双栏同步（任务 #4） */
  'hunk-resolved': [payload: HunkResolvedPayload]
}>()

/**
 * 内部始终创建一份 diff 状态；若父级 provide 了共享实例则优先使用（任务 #6）。
 * inject 的第二个参数为默认值，保证组合式 API 调用顺序稳定。
 */
const owned = useMarkdownDiff(
  () => props.oldMarkdown,
  () => props.newMarkdown,
  () => props.diffConfig
)
const { html, hunks, resolveAction } = inject<UseMarkdownDiffReturn>(markdownDiffKey, owned)

/** 根据 hunkResolve 配置写回 old/new 并触发事件 */
function emitResolved(payload: HunkResolvedPayload) {
  if (payload.oldMarkdown !== undefined) {
    emit('update:oldMarkdown', payload.oldMarkdown)
  }
  if (payload.newMarkdown !== undefined) {
    emit('update:newMarkdown', payload.newMarkdown)
  }
  emit('hunk-resolved', payload)
}

/**
 * 处理 diff 面板中的点击：仅响应带 data-action 的按钮。
 */
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const btn = target.closest('[data-action]') as HTMLElement | null
  if (!btn) return

  e.preventDefault()
  e.stopPropagation()

  const hunkEl = btn.closest('[data-diff-id]') as HTMLElement | null
  const id = hunkEl?.getAttribute('data-diff-id')
  const action = btn.getAttribute('data-action') as 'accept' | 'reject' | null
  if (!id || !action) return

  const hunk = hunks.value.get(id)
  if (!hunk) return

  emitResolved(resolveAction(hunk, action))
}

/** 键盘快捷键：聚焦在 diff 容器内时 A 接受 / R 拒绝（任务 #14） */
function onKeydown(e: KeyboardEvent) {
  if (e.target !== e.currentTarget) return
  const active = document.activeElement?.closest('[data-diff-id]') as HTMLElement | null
  if (!active) return
  const id = active.getAttribute('data-diff-id')
  if (!id) return
  const hunk = hunks.value.get(id)
  if (!hunk) return
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault()
    emitResolved(resolveAction(hunk, 'accept'))
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault()
    emitResolved(resolveAction(hunk, 'reject'))
  }
}
</script>

<template>
  <div class="markdown-diff-container">
    <div
      class="markdown-diff-content"
      tabindex="0"
      v-html="html"
      @click="onContentClick"
      @keydown="onKeydown"
    />
  </div>
</template>

<style>
@import 'highlight.js/styles/github.css';

.markdown-diff-container {
  padding: 20px;
  background: #ffffff;
  border-radius: 8px;
}

.markdown-diff-content {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  outline: none;
}

.markdown-diff-content:focus-visible {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
  border-radius: 4px;
}

.markdown-diff-content h1,
.markdown-diff-content h2,
.markdown-diff-content h3 {
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.markdown-diff-content h1 {
  font-size: 2em;
  margin-top: 0;
}

.markdown-diff-content h2 {
  font-size: 1.5em;
}

.markdown-diff-content p {
  margin: 1em 0;
}

.markdown-diff-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25em 0;
  font-size: 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  table-layout: fixed;
}

.markdown-diff-content thead {
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.markdown-diff-content th,
.markdown-diff-content td {
  padding: 12px 14px;
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
  position: relative;
}

.markdown-diff-content th:last-child,
.markdown-diff-content td:last-child {
  border-right: none;
}

.markdown-diff-content thead th {
  font-weight: 700;
  color: #111827;
  font-size: 15px;
}

.markdown-diff-content tbody tr:nth-child(even) {
  background: #fafafa;
}

.markdown-diff-content tbody tr:hover {
  background: #f3f8ff;
}

.markdown-diff-content tbody td {
  color: #1f2937;
}

.markdown-diff-content tbody tr.diff-hunk--insert {
  background: rgba(16, 185, 129, 0.1);
}

.markdown-diff-content tbody tr.diff-hunk--delete,
.markdown-diff-content tbody tr.diff-hunk--modified {
  background: rgba(239, 68, 68, 0.06);
}

.markdown-diff-content td.diff-hunk--insert,
.markdown-diff-content th.diff-hunk--insert {
  background: rgba(16, 185, 129, 0.18);
}

.markdown-diff-content td.diff-hunk--delete,
.markdown-diff-content th.diff-hunk--delete {
  background: rgba(239, 68, 68, 0.12);
}

.markdown-diff-content li.diff-hunk--insert {
  background: rgba(16, 185, 129, 0.1);
}

.markdown-diff-content li.diff-hunk--delete,
.markdown-diff-content li.diff-hunk--modified {
  background: rgba(239, 68, 68, 0.06);
}

.markdown-diff-content pre {
  background-color: #f6f8fa;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  position: relative;
}

.markdown-diff-content pre .code-lang-label {
  position: absolute;
  top: 0;
  right: 0;
  padding: 2px 8px;
  font-size: 11px;
  color: #6b7280;
  background: #e5e7eb;
  border-radius: 0 6px 0 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  pointer-events: none;
  line-height: 1.4;
}

.markdown-diff-content pre code {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
}

.markdown-diff-content :not(pre) > code {
  background-color: #f3f4f6;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
}

.diff-delete {
  background-color: #fecaca;
  color: #dc2626;
  text-decoration: auto;
  padding: 1px 3px;
  border-radius: 2px;
}

.diff-insert {
  background-color: #bbf7d0;
  color: #059669;
  text-decoration: none;
  padding: 1px 3px;
  border-radius: 2px;
}

.diff-hunk {
  position: relative;
  margin: 8px 0;
  border-radius: 4px;
}

.diff-hunk--insert {
  background-color: rgba(16, 185, 129, 0.1);
  border-left: 3px solid #10b981;
  padding: 12px 12px 12px 16px;
}

.diff-hunk--delete {
  background-color: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
  padding: 12px 12px 12px 16px;
}

.diff-hunk--modified {
  background-color: rgba(59, 130, 246, 0.06);
  border-left: 3px solid #3b82f6;
  padding: 12px 12px 12px 16px;
}

.diff-hunk-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0.15;
  transition: opacity 0.15s ease;
  z-index: 1;
}

.diff-hunk:hover .diff-hunk-toolbar,
.diff-hunk:focus-within .diff-hunk-toolbar,
.markdown-diff-content:focus-within .diff-hunk-toolbar {
  opacity: 1;
}

.diff-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  line-height: 1.4;
}

.diff-btn:hover {
  background: #f9fafb;
}

.diff-btn-accept {
  color: #059669;
  border-color: #6ee7b7;
}

.diff-btn-reject {
  color: #dc2626;
  border-color: #fca5a5;
}
</style>
