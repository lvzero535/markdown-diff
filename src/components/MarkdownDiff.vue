<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseMarkdown, buildMergedMdast, renderMdastToHtml, applyHunkResolution, applyHunkAcceptOnOldAst, mdastToMarkdown } from '../utils/markdownDiff'
import type { DiffHunk } from '../utils/markdownDiff'

/**
 * MarkdownDiff 组件属性。
 *
 * 该组件接收旧 Markdown 和新 Markdown，并渲染一个可交互的差异视图，
 * 用户可以在 diff 面板中直接接受或拒绝单个变更。
 */
const props = defineProps<{
  /** 旧版本 Markdown 原文。 */
  oldMarkdown: string
  /** 新版本 Markdown 原文。 */
  newMarkdown: string
}>()

/**
 * 组件事件定义。
 *
 * 当用户接受/拒绝某个 diff hunk 时，组件会向父组件回传更新后的 Markdown 文本，
 * 以便父组件同步刷新编辑器中的内容。
 */
const emit = defineEmits<{
  /** 更新旧 Markdown 内容。 */
  'update:oldMarkdown': [value: string]
  /** 更新新 Markdown 内容。 */
  'update:newMarkdown': [value: string]
}>()

const hunksRef = ref<Map<string, DiffHunk>>(new Map())

/**
 * 由旧/新 Markdown 计算得到的合并结果。
 *
 * 其中 `mdast` 用于最终渲染，`hunks` 用于按钮交互时定位差异块。
 */
const merged = computed(() => {
  const oldAst = parseMarkdown(props.oldMarkdown)
  const newAst = parseMarkdown(props.newMarkdown)
  return buildMergedMdast(oldAst, newAst)
})

/**
 * 同步最新的 hunks 索引，确保按钮点击时拿到的是当前 diff 状态。
 */
watch(
  merged,
  (m) => {
    hunksRef.value = m.hunks
  },
  { immediate: true }
)

/**
 * 将 merged AST 转换为 HTML 字符串，用于 `v-html` 渲染。
 */
const html = computed(() => renderMdastToHtml(merged.value.mdast as Parameters<typeof renderMdastToHtml>[0]))

/**
 * 处理 diff 面板中的点击事件。
 *
 * 只响应带有 `data-action` 的按钮点击，避免干扰正文中的普通交互。
 * 当用户点击“接受/拒绝”时，会根据对应 hunk 生成新的 Markdown 并回传给父组件。
 *
 * @param e - 鼠标点击事件。
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

  const hunk = hunksRef.value.get(id)
  if (!hunk) return

  if (action === 'accept') {
    // 接受变更：修改 oldMarkdown 使其与该 hunk 的新版本内容一致
    const oldAst = parseMarkdown(props.oldMarkdown)
    const patchedOld = applyHunkAcceptOnOldAst(oldAst, hunk)
    emit('update:oldMarkdown', mdastToMarkdown(patchedOld))
  } else {
    // 拒绝变更：修改 newMarkdown 恢复该 hunk 的旧版本内容
    const newAst = parseMarkdown(props.newMarkdown)
    const patched = applyHunkResolution(newAst, hunk, action)
    emit('update:newMarkdown', mdastToMarkdown(patched))
  }
}
</script>

<template>
  <!-- diff 容器：承载最终渲染后的 Markdown HTML -->
  <div class="markdown-diff-container">
    <!-- 使用 v-html 输出带有 diff 标记的 HTML，并在容器上统一接管点击事件 -->
    <div
      class="markdown-diff-content"
      v-html="html"
      @click="onContentClick"
    />
  </div>
</template>

<style>
/* highlight.js 代码高亮主题 */
@import 'highlight.js/styles/github.css';

/* 整体 diff 面板容器 */
.markdown-diff-container {
  padding: 20px;
  background: #ffffff;
  border-radius: 8px;
}

/* Markdown 正文基础排版 */
.markdown-diff-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
}

.markdown-diff-content :deep(h1),
.markdown-diff-content :deep(h2),
.markdown-diff-content :deep(h3) {
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.markdown-diff-content :deep(h1) {
  font-size: 2em;
  margin-top: 0;
}

.markdown-diff-content :deep(h2) {
  font-size: 1.5em;
}

.markdown-diff-content :deep(p) {
  margin: 1em 0;
}

.markdown-diff-content :deep(table) {
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

.markdown-diff-content :deep(thead) {
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.markdown-diff-content :deep(th),
.markdown-diff-content :deep(td) {
  padding: 12px 14px;
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
}

.markdown-diff-content :deep(th:last-child),
.markdown-diff-content :deep(td:last-child) {
  border-right: none;
}

.markdown-diff-content :deep(thead th) {
  font-weight: 700;
  color: #111827;
  font-size: 15px;
}

.markdown-diff-content :deep(tbody tr:nth-child(even)) {
  background: #fafafa;
}

.markdown-diff-content :deep(tbody tr:hover) {
  background: #f3f8ff;
}

.markdown-diff-content :deep(tbody td) {
  color: #1f2937;
}

.markdown-diff-content :deep(tbody tr.diff-hunk--insert) {
  background: rgba(16, 185, 129, 0.1);
}

.markdown-diff-content :deep(tbody tr.diff-hunk--delete),
.markdown-diff-content :deep(tbody tr.diff-hunk--modified) {
  background: rgba(239, 68, 68, 0.06);
}

.markdown-diff-content :deep(li.diff-hunk--insert) {
  background: rgba(16, 185, 129, 0.1);
}

.markdown-diff-content :deep(li.diff-hunk--delete),
.markdown-diff-content :deep(li.diff-hunk--modified) {
  background: rgba(239, 68, 68, 0.06);
}

.markdown-diff-content :deep(pre) {
  background-color: #f6f8fa;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  position: relative;
}

.markdown-diff-content :deep(pre .code-lang-label) {
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

.markdown-diff-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
}

.markdown-diff-content :deep(:not(pre) > code) {
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
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1;
}

.diff-hunk:hover .diff-hunk-toolbar {
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
