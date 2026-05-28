<script setup lang="ts">
import { inject, watch } from 'vue'
import { useMarkdownDiff } from './useMarkdownDiff'
import { markdownDiffKey } from './inject'
import type { DiffConfig } from './types'
import type { HunkResolvedPayload, UseMarkdownDiffReturn } from './useMarkdownDiff'

/**
 * Markdown 差异对比与修订组件（单稿 Working 模式）。
 *
 * - `oldMarkdown` / `newMarkdown`：仅用于初次 merge 出对比视图。
 * - `finalMarkdown`：accept/reject 后从 working 树导出的定稿，双向绑定。
 * - 接受 = 采纳新稿快照；拒绝 = 保留旧稿快照（相对各 hunk 的 oldNode/newNode）。
 */
const props = withDefaults(
  defineProps<{
    oldMarkdown: string
    newMarkdown: string
    finalMarkdown?: string
    diffConfig?: Partial<DiffConfig>
  }>(),
  { finalMarkdown: '' }
)

const emit = defineEmits<{
  'update:finalMarkdown': [value: string]
  'hunk-resolved': [payload: HunkResolvedPayload]
}>()

const owned = useMarkdownDiff(
  () => props.oldMarkdown,
  () => props.newMarkdown,
  () => props.diffConfig
)
const { html, hunks, resolveAction, finalMarkdown } = inject<UseMarkdownDiffReturn>(
  markdownDiffKey,
  owned
)

/** 初次 merge 与每次 resolve 后，将 composable 内的 finalMarkdown 同步给 v-model */
watch(
  finalMarkdown,
  (value) => {
    emit('update:finalMarkdown', value)
  },
  { immediate: true }
)

/** 将 working 导出的 finalMarkdown 同步给父组件 */
function emitResolved(payload: HunkResolvedPayload) {
  emit('update:finalMarkdown', payload.finalMarkdown)
  emit('hunk-resolved', payload)
}

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
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-diff-content th,
.markdown-diff-content td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.markdown-diff-content th {
  background: #f5f5f5;
}

.markdown-diff-content pre {
  background: #f6f8fa;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
}

.markdown-diff-content code {
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
}

.markdown-diff-content .diff-hunk {
  position: relative;
  margin: 0.25em 0;
  padding: 0.25em 0.5em;
  border-radius: 4px;
}

.markdown-diff-content .diff-hunk--insert {
  background: rgba(46, 160, 67, 0.12);
}

.markdown-diff-content .diff-hunk--delete {
  background: rgba(248, 81, 73, 0.12);
}

.markdown-diff-content .diff-hunk--modified {
  background: rgba(255, 212, 0, 0.15);
}

.markdown-diff-content ins.diff-insert {
  background: rgba(46, 160, 67, 0.35);
  text-decoration: none;
}

.markdown-diff-content del.diff-delete {
  background: rgba(248, 81, 73, 0.35);
  text-decoration: line-through;
}

.markdown-diff-content .diff-toolbar {
  display: inline-flex;
  gap: 4px;
  margin-left: 8px;
  vertical-align: middle;
}

.markdown-diff-content .diff-btn {
  padding: 2px 8px;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.markdown-diff-content .diff-btn:hover {
  background: #f0f0f0;
}

.markdown-diff-content .diff-btn-accept {
  color: #1a7f37;
  border-color: #1a7f37;
}

.markdown-diff-content .diff-btn-reject {
  color: #cf222e;
  border-color: #cf222e;
}
</style>
