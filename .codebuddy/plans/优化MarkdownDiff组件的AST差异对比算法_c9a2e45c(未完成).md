---
name: 优化MarkdownDiff组件的AST差异对比算法
overview: 根据 cursor_dynamic_programming_for_lcs_back.md 文档，解决当前 LCS 算法在 paragraph 等同 key 节点上的错位匹配问题，采用渐进式方案：先实现方案 B（严格相等条件 + nodeKey 增强内容指纹），再升级到方案 D（递归树 diff + 前后缀扫描 + 中间内容匹配）。
todos:
  - id: enhance-nodekey
    content: 增强 nodeKey：新增 extractTextContent 和 djb2Hash，为 paragraph 等文本块节点追加内容指纹
    status: pending
  - id: strengthen-buildDP
    content: 强化 buildDP：相等条件增加 nodesDeepEqual 检查，预计算 contentHash 避免 JSON.stringify 开销
    status: pending
    dependencies:
      - enhance-nodekey
  - id: implement-pairing
    content: 实现 pairModifiedNodes：扫描连续 delete+insert 区域，按同类型配对转为 equal
    status: pending
  - id: integrate-pipeline
    content: 集成到 mergeSubsequence 流水线：backtrackDiff → pairModifiedNodes → 返回结果
    status: pending
    dependencies:
      - implement-pairing
      - strengthen-buildDP
  - id: verify-mockdata
    content: 验证 mockData：确认相同段落标为 unchanged，修改段落保留行内 diff，新增段落标为 insert
    status: pending
    dependencies:
      - integrate-pipeline
  - id: add-edge-cases
    content: 增加边界测试用例：多段落重排、完全删除、嵌套列表等场景
    status: pending
    dependencies:
      - verify-mockdata
---

## 产品概述

Markdown AST Diff 组件的 LCS 匹配算法存在节点错位问题：当中间插入新段落后，多个相同类型（如 `paragraph`）的节点在 LCS 回溯时发生整体错位，导致完全相同的段落被错误标记为"新增"+"修改"，而非正确的"未变更"。

## 核心问题

- `nodeKey` 函数对 `paragraph` 等类型只返回 `paragraph`，无内容区分，LCS 无法区分不同段落
- 回溯 tie-break（`dp[i-1][j] >= dp[i][j-1]` 时优先 delete）在多同 key 节点时导致语义错位
- mockData 中 "Looking ahead" 段落在新旧版完全相同，却被标为 insert + modified

## 核心功能需求

1. 增强 `nodeKey`，为文本类块节点加入内容指纹，使相同内容的段落具有相同 key
2. 在 LCS 匹配后增加后处理配对步骤，将同类型的 delete+insert 节点配对为 equal，保留行内 diff 能力
3. 验证 mockData 中相同段落正确标记为 unchanged，修改段落正确显示行内 diff
4. 为后续升级到递归树 diff（方案 D）预留扩展空间

## 技术栈

- 框架：Vue 3 + TypeScript（现有项目）
- 核心依赖：unified/remark（Markdown 解析）、diff-match-patch（文本级 diff）、diff（词级 diff）
- 修改范围：仅 `src/utils/markdownDiff.ts`

## 实现方案

### 方案选型：A（增强 nodeKey）+ E-lite（后处理配对）

文档建议的方案 B（严格相等才进 LCS）存在副作用：修改过的段落因内容不同而无法在 LCS 中配对，会变成 delete+insert，丢失行内 diff 能力。因此采用更优组合：

1. **方法 A**：`nodeKey` 加入内容指纹 → 相同内容段落自动在 LCS 中正确匹配
2. **方法 E-lite**：LCS 后扫描 delete+insert 对，按类型和内容相似度配对 → 修改段落恢复行内 diff

### 数据流

```
parseMarkdown → addKeyToNodes(nodeKey增强) → buildDP → backtrackDiff → pairModifiedNodes(新增) → buildMergedFromDiff
```

### 关键设计决策

**nodeKey 内容指纹**：使用 djb2 哈希对节点文本内容计算指纹，而非直接拼接原文。原因：key 需保持紧凑，长段落原文拼接会导致 key 过长且可能含特殊字符。

**后处理配对策略**：在 backtrackDiff 结果上扫描连续的 delete+insert 序列，按"同类型 + 最短编辑距离"贪心配对。不使用全局最优配对（匈牙利算法），因为 diff 场景中连续区域的局部贪心已足够准确且 O(n) 复杂度更低。

**不采用方案 B 的原因**：方案 B 使 `nodesDeepEqual` 成为 LCS 入场条件，修改过的段落无法配对，`mergeEqualNodes` 的行内 diff 完全失效。方法 A+E-lite 在保持行内 diff 的同时解决了错位问题。

## 实现细节

### 核心目录结构

```
src/utils/markdownDiff.ts   # [MODIFY] 核心修改文件，所有变更集中于此
src/data/mockData.ts        # [MODIFY] 增加边界测试用例
```

### 修改清单

**1. `nodeKey` 函数（447-471行）**

- 新增 `extractTextContent` 辅助函数：递归提取节点下所有文本内容并归一化
- 新增 `djb2Hash` 辅助函数：计算字符串的 djb2 哈希值
- 为 `paragraph`、`listItem`、`blockquote`、`tableCell` 等文本块节点追加内容指纹：`paragraph|h${hash}`

**2. 新增 `pairModifiedNodes` 函数**

- 输入：`backtrackDiff` 的 `DiffNode[]` 结果
- 逻辑：扫描连续的 delete/insert 区域，对同类型节点按顺序配对
- 配对条件：`stripMeta(deleteNode).type === stripMeta(insertNode).type`
- 配对后：将 delete+insert 转换为 `equal`（含 `{ oldNode, newNode }`），供后续 `mergeEqualNodes` 处理行内 diff
- 未配对的保持原样（insert 或 delete）

**3. `mergeSubsequence` 函数（482-485行）**

- 在 `backtrackDiff` 后调用 `pairModifiedNodes` 处理结果
- 改为：`return pairModifiedNodes(backtrackDiff(dp, oldAst, newAst))`

**4. `buildDP` 函数（496-511行）**

- 相等条件增加 `nodesDeepEqual` 检查作为安全网（方法 B 的轻量版）
- 条件改为：`oldAst[i-1].key === newAst[j-1].key && nodesDeepEqual(oldAst[i-1], newAst[j-1])`
- 这确保 LCS 只配对真正相同的节点，内容指纹碰撞时也不会误配

### 性能考量

- `extractTextContent` 在 `addKeyToNodes` 阶段调用，每个节点遍历一次，O(N) 其中 N 为 AST 节点总数
- `djb2Hash` 为 O(L) 其中 L 为文本长度，段落文本通常很短
- `pairModifiedNodes` 为 O(D) 其中 D 为 diff 结果长度，远小于原始 AST
- `nodesDeepEqual` 在 buildDP 中调用，最坏 O(M*N) 次，每次 JSON.stringify 开销较大——优化方案：在 `addKeyToNodes` 阶段预计算 `contentHash`，buildDP 中比较 `contentHash` 而非 `nodesDeepEqual`

## Agent Extensions

### SubAgent

- **code-explorer**: 用于深入探索 markdownDiff.ts 中 `mergeEqualNodes` 的递归调用链，确认 `pairModifiedNodes` 不会破坏现有递归 diff 逻辑