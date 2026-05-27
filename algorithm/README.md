# Algorithm

本目录收录 Markdown Diff 核心算法的 **LeetCode 风格** 题解，便于学习与面试对照。

| 编号 | 题目 | 源码对应 |
|------|------|----------|
| [MD-001](./weighted-maximum-common-subsequence.md) | 带权最长公共子序列与回溯对齐 | `markdownDiff.ts` → `buildDP` / `backtrackDiff` |
| [MD-002](./text-similarity.md) | 块级文本相似度：从 AST 节点到 0~1 权重 | `markdownDiff.ts` → `extractTextFromNode` / `computeTextSimilarity` / `canNodesMatch` |

项目实现：`src/components/markdownDiff/markdownDiff.ts`
