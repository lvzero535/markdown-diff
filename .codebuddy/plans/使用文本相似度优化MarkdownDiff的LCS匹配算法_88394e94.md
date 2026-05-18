---
name: 使用文本相似度优化MarkdownDiff的LCS匹配算法
overview: 修改 markdownDiff.ts 中的 LCS 匹配算法，使块级元素在类型相同且内容相似度 ≥ 35% 时被匹配为同一元素(modified)，低于阈值则被视为不同元素(insert/delete)。code 元素在 lang 不同时直接视为不同元素。
todos:
  - id: add-config-and-helpers
    content: 新增 DiffConfig 类型、extractTextFromNode、computeTextSimilarity、buildAutoMatchCodeLangs、canNodesMatch 函数
    status: completed
  - id: modify-dp-and-backtrack
    content: 修改 buildDP 和 backtrackDiff，用 canNodesMatch 替换 key 严格相等判断
    status: completed
    dependencies:
      - add-config-and-helpers
  - id: modify-merge-subsequence
    content: 修改 mergeSubsequence 和 buildMergedMdast，透传 config 和 autoMatchCodeLangs 参数
    status: completed
    dependencies:
      - modify-dp-and-backtrack
  - id: add-mockdata-and-verify
    content: 更新 mockData 增加 code 块测试用例，验证算法正确性
    status: completed
    dependencies:
      - modify-merge-subsequence
---

## 产品概述

修改 markdownDiff.ts 中的 AST 节点匹配算法，从基于 key 严格相等改为基于类型+内容相似度的模糊匹配，使 diff 结果更准确地反映文档变更语义。

## 核心功能

- 块级元素类型相同且内容相似度 >= 35%（可配置）→ 被识别为同一元素，标记为 modified
- 块级元素类型相同但相似度 < 35% → 被识别为不同元素，标记为 insert/delete
- code 元素特殊规则：lang 不同 → 直接视为不同元素；新旧各只有1个同 lang code → 始终视为同一元素；多个同 lang code → 用相似度匹配
- 相似度基于文本 LCS 计算：提取节点纯文本，用 LCS 长度占较长文本的比例
- 统一 35% 阈值，通过配置参数可调

## Tech Stack

- 语言: TypeScript（现有项目）
- 框架: Vue 3 + Vite（现有项目，不涉及修改）
- 核心依赖: diff-match-patch, diff, unified/remark（现有，不涉及修改）

## Implementation Approach

### 核心策略

将现有的 LCS DP 匹配条件从 `key === key`（严格相等）改为 `canNodesMatch()`（类型+结构属性+相似度阈值），其余 DP 结构和回溯逻辑不变。仅在顶层块级元素匹配时使用相似度匹配，递归子节点匹配保持现有 key-based 逻辑不变。

### 关键设计决策

1. **相似度仅用于顶层匹配**：`buildMergedMdast` 中的顶层 mergeSubsequence 使用相似度匹配；`mergeEqualNodes` 中递归调用的 mergeSubsequence 保持 key-based 匹配。原因：相似度匹配适用于块级元素的粗粒度配对，而内联元素的细粒度 diff 应保持精确匹配。
2. **code 1:1 自动匹配**：预处理阶段统计各 lang 的 code 数量，对 1:1 的 lang 跳过相似度检查直接匹配。此信息需传入 DP 构建函数。
3. **相似度缓存**：DP 过程中每对节点最多比较一次，无需额外缓存。类型不匹配的早期跳过可避免不必要的相似度计算。
4. **向后兼容**：`buildMergedMdast` 新增可选 `config` 参数，默认值与现有行为等价（threshold=0 时退化为 key 匹配，但默认 0.35）。

### 性能分析

- LCS 文本相似度计算：O(L1 * L2) 每对节点，L1/L2 为文本长度
- DP 总复杂度：O(m * n * L_avg^2)，m/n 为块级元素数量
- 典型场景：m, n ~ 10-50，L_avg ~ 50-500，可接受
- 优化：类型不匹配时直接跳过，避免无效相似度计算

## Architecture Design

### 数据流

```
buildMergedMdast(oldAst, newAst, config)
  ├─ buildAutoMatchCodeLangs(oldChildren, newChildren)  // [NEW] 预处理1:1 code
  ├─ addKeyToNodes(oldChildren) / addKeyToNodes(newChildren)
  └─ mergeSubsequence(old, new, config, autoMatchLangs)  // [MODIFIED] 传入配置
       ├─ buildDP(old, new, config, autoMatchLangs)       // [MODIFIED] 使用 canNodesMatch
       │    └─ canNodesMatch(old, new, threshold, langs)   // [NEW] 模糊匹配判断
       │         └─ computeTextSimilarity(old, new)         // [NEW] 文本LCS相似度
       │              └─ extractTextFromNode(node)          // [NEW] 提取纯文本
       └─ backtrackDiff(dp, old, new, config, autoMatchLangs) // [MODIFIED] 使用 canNodesMatch
```

### 关键匹配规则 (canNodesMatch)

| 节点类型 | 类型匹配 | 结构属性 | 相似度 |
| --- | --- | --- | --- |
| heading | type相同 | depth相同 | >= threshold |
| code | type相同 | lang相同；1:1 lang跳过相似度 | >= threshold（1:1除外） |
| table | type相同 | - | >= threshold |
| paragraph | type相同 | - | >= threshold |
| 其他 | type相同 | 按现有nodeKey逻辑 | >= threshold |


## Directory Structure

```
src/utils/markdownDiff.ts  # [MODIFY] 核心修改文件
```

### 修改详情

**src/utils/markdownDiff.ts** - [MODIFY]

新增函数：

- `extractTextFromNode(node)` — 递归提取 mdast 节点的纯文本内容
- `computeTextSimilarity(oldNode, newNode)` — 基于文本 LCS 计算两个节点的相似度（0~1）
- `buildAutoMatchCodeLangs(oldChildren, newChildren)` — 找出 1:1 code lang 集合
- `canNodesMatch(oldNode, newNode, threshold, autoMatchCodeLangs)` — 判断两个节点是否可匹配

新增类型：

- `DiffConfig` — `{ similarityThreshold: number }` 配置类型
- `DEFAULT_DIFF_CONFIG` — 默认配置 `{ similarityThreshold: 0.35 }`

修改函数：

- `buildMergedMdast` — 新增可选 `config` 参数，调用 `buildAutoMatchCodeLangs`，将 config 和 autoMatchLangs 传入 `mergeSubsequence`
- `mergeSubsequence` — 新增可选 `config` 和 `autoMatchCodeLangs` 参数，传递给 `buildDP` 和 `backtrackDiff`
- `buildDP` — 将 `key === key` 判断替换为 `canNodesMatch()` 调用
- `backtrackDiff` — 将 `key === key` 判断替换为 `canNodesMatch()` 调用

不变函数：

- `mergeEqualNodes` — 递归子节点匹配仍使用现有 key-based mergeSubsequence
- `addKeyToNodes` / `nodeKey` — 保持不变，供递归调用使用
- `buildMergedFromDiff` — 保持不变，已有的 equal→modified/unchanged 逻辑继续适用
- 所有渲染/HTML 相关函数 — 不变

## Implementation Notes

- `canNodesMatch` 中，对于没有文本内容的节点（如 thematicBreak），类型匹配即视为可匹配（相似度视为 1.0）
- `extractTextFromNode` 对 code 节点提取 `node.value`，对 text/inlineCode 提取 `node.value`，对其他节点递归拼接 children 文本
- `computeTextSimilarity` 中两个空文本的相似度定义为 1.0（完全相同）
- DP 中 `canNodesMatch` 返回 true 时，回溯也必须用相同条件（保持一致性），否则回溯结果可能错误
- `DiffConfig` 通过 `Partial<DiffConfig>` 传入 `buildMergedMdast`，缺失字段用默认值填充