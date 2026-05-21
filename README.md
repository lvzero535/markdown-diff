# Markdown Diff

基于 Vue 3 + mdast 的 Markdown 双栏差异对比组件，支持块级 LCS 对齐、行内/字符级 diff、表格列映射，以及接受/拒绝单个变更块。

## 功能概览

- 将 **old** / **new** 两份 Markdown 解析为 AST，合并为带标注的 merged AST 并渲染为 HTML
- 块级变更可 **接受**（更新旧稿）或 **拒绝**（回退新稿）
- 表格列增删、列表项等 **子级 hunk** 支持独立操作（见 `docs/TODO.md` 里程碑 2）
- 渲染管线集成 **rehype-sanitize**，降低不可信内容经 `v-html` 输出时的 XSS 风险

## 接受 / 拒绝语义（可配置）

通过 `diffConfig.hunkResolve` 指定**接受/拒绝时更新哪一侧**：

| 字段 | 可选值 | 默认 |
|------|--------|------|
| `onAccept` | `'old'` \| `'new'` \| `'both'` | `'old'` |
| `onReject` | `'new'` \| `'old'` \| `'both'` | `'new'` |

**预设**（`HUNK_RESOLVE_PRESETS`）：

| 预设 | onAccept | onReject | 说明 |
|------|----------|----------|------|
| `classic` | old | new | 默认：接受改旧稿，拒绝改新稿 |
| `syncBoth` | both | both | 每次操作同时写回两侧，该 hunk 立即在两侧一致 |
| `mirror` | new | old | 与默认相反 |

```vue
<MarkdownDiff
  :diff-config="{
    similarityThreshold: 0.35,
    hunkResolve: HUNK_RESOLVE_PRESETS.syncBoth,
  }"
/>
```

```ts
import { HUNK_RESOLVE_PRESETS, resolveHunk } from './components/markdownDiff'
```

## 使用组件

```vue
<script setup>
import { ref } from 'vue'
import { MarkdownDiff } from './components/markdownDiff'

const oldMd = ref('# Hello')
const newMd = ref('# Hi')
</script>

<template>
  <MarkdownDiff
    v-model:old-markdown="oldMd"
    v-model:new-markdown="newMd"
    :diff-config="{ similarityThreshold: 0.4 }"
    @hunk-resolved="(p) => console.log(p)"
  />
</template>
```

## Composable

```ts
import { useMarkdownDiff } from './components/markdownDiff'

const { html, hunks, merged, accept, reject } = useMarkdownDiff(
  () => oldMarkdown.value,
  () => newMarkdown.value,
  { similarityThreshold: 0.35 }
)
```

## 配置项 `DiffConfig`

| 字段 | 默认 | 说明 |
|------|------|------|
| `similarityThreshold` | `0.35` | 块级 LCS 文本相似度阈值 |
| `headerSimilarityThreshold` | `0.85` | 表头 fuzzy 匹配阈值 |
| `maxSimilarityTextLength` | `2000` | 相似度计算最大字符数（性能） |
| `hunkResolve.onAccept` | `'old'` | 接受时更新 old / new / both |
| `hunkResolve.onReject` | `'new'` | 拒绝时更新 old / new / both |

`heading` / `code` / `table` 等节点类型会使用更高的内置阈值，减少误匹配。

## 安全说明

- 渲染使用 `v-html`；已对 HAST 做 **rehype-sanitize**
- 若 Markdown 来自不可信用户，请勿依赖 `allowDangerousHtml` 解析任意 HTML；必要时关闭 GFM 原始 HTML 或加强消毒 schema

## 开发

```bash
npm install --legacy-peer-deps
npm run dev
npm run build
npm run test
```

## 文档

- [优化任务清单](docs/TODO.md)

## 技术栈

Vue 3 · TypeScript · Vite · unified / remark / rehype · mdast-util-to-markdown · diff / diff-match-patch
