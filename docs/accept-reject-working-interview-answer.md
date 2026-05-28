# 面试答题稿：Working 单稿模式下的 接受/拒绝（Accept/Reject）

> 适用场景：面试官问“你这个 diff 为什么能点接受/拒绝？点一下到底改了什么？怎么导出最终 Markdown？有哪些坑？”  
> 本文基于当前仓库 **Working 单稿模式** 的真实实现整理：`MarkdownDiff.vue` + `useMarkdownDiff.ts` + `workingHunk.ts`。

---

## 一句话概述（10 秒）

**我们只在内存里维护一份“正在定稿”的 working AST：首次用 old/new 计算出带 diff 标记的展示树和 hunk 列表；之后点击接受/拒绝只 patch 这棵展示树（按 hunk.id 定位），同时移除该 hunk 的标记并重新渲染；最终 Markdown 直接由 working AST 清理 diff 元数据后序列化得到。**

---

## 端到端数据流（从点击到导出）

### 1) 初次进入（只做一次的事）

- **输入**：`oldMarkdown` + `newMarkdown`
- **解析**：`parseMarkdown(old)` / `parseMarkdown(new)`
- **对齐与合并**：`buildMergedMdast(oldAst, newAst)` 产出：
  - `mdast`：带 diff 元数据的 **合并展示树**
  - `hunks: Map<id, DiffHunk>`：可交互差异块索引（每个块有 `id/diffType/oldNode/newNode` 等快照）
- **进入 working**：`workingMdast = cloneAst(mdast)`；`pendingHunks = new Map(hunks)`
- **渲染与导出**：
  - `html = renderMdastToHtml(workingMdast)`
  - `finalMarkdown = workingMdastToMarkdown(workingMdast)`（导出前会清理 diff 节点）

对应实现：
- `src/components/markdownDiff/useMarkdownDiff.ts`：`resetFromSources()` + `syncView()`

### 2) 用户点击 accept/reject（每次都做的事）

事件入口：
- `src/components/markdownDiff/MarkdownDiff.vue`：事件委托，读取 DOM 的 `data-action` + `data-diff-id`

核心流程：
1. 用 `data-diff-id` 从 `pendingHunks` 找到 `DiffHunk`
2. `resolveAction(hunk, action)`：
   - `applyHunkToWorkingMdast(workingMdast, hunk, action)`（原地 patch）
   - `pendingHunks.delete(hunk.id)`
   - `syncView()`：重新渲染 + 更新 `finalMarkdown`

输出：
- 父组件通过 `update:finalMarkdown` 或直接使用 composable 的 `finalMarkdown` 读到最终 Markdown。

---

## 核心状态与“真源”是谁

Working 模式的关键点是：**真源只有一份**，并且它在组件内部单向演进。

- **`workingMdast`**（真源）：展示树也是定稿树；每次 accept/reject 都 patch 这里。
- **`pendingHunks`**（待办清单）：用于按钮点击时反查 hunk；每处理一个就删除。
- **`html`**：`renderMdastToHtml(workingMdast)` 的结果，用于 `v-html`。
- **`finalMarkdown`**：`workingMdastToMarkdown(workingMdast)` 的结果，用于最终导出/保存。

对应实现：
- `src/components/markdownDiff/useMarkdownDiff.ts`：`workingMdast` / `pendingHunks` / `finalMarkdown`

---

## accept/reject 真值表（Working 树语义）

Working 模式下，accept/reject 的语义非常稳定：**accept 采纳新稿快照，reject 保留旧稿快照**。

在 `src/components/markdownDiff/workingHunk.ts` 的 `applyHunkToWorkingMdast()` 中：

- **`insert`（新稿新增块）**
  - **accept**：保留该块，并把它从“红绿标记块”变成普通 mdast 节点（去掉 diff 元数据）
  - **reject**：从 working children 里删除该块

- **`delete`（旧稿独有、待删除块）**
  - **accept**：从 working children 里删除该块
  - **reject**：用 `oldNode` 快照替换当前节点（去掉 diff 元数据）

- **`modified`（块级整体修改）**
  - **accept**：替换为 `newNode`
  - **reject**：替换为 `oldNode`

注意：这里 patch 的是 **working 展示树**，不再把修改写回 old/new 源字符串。

---

## 为什么按 hunk.id 定位，而不是按 path

这是 Working 模式最“细节但很关键”的点，面试官经常会追问。

### 1) 现象：merged 展示树的 children 下标不等于 newAst 的下标

在构建 merged 的过程中：
- `insert` 会进入 merged.children，并推进 `newAstIndex`
- `delete` **也会进入 merged.children（为了让用户看到红块）**，但 **不推进 `newAstIndex`**

所以 merged.children 是“为了展示而拼出来的序列”，其数组下标并不等于 newAst 中的真实位置。

### 2) 结论：不能用 `hunk.path` 直接定位 working 展示树

如果用 path 去定位 working.children，会在包含 delete 块的区域发生漂移：定位到错误节点或越界。

### 3) 解决：用 DOM/AST 上的稳定标记 `data-diff-id`

实现方式：
- 构建 merged 时为可交互块写入 `node.data.diffId`，并在渲染侧表现为 DOM 上的 `data-diff-id`
- 点击时拿 `data-diff-id` 回查 `pendingHunks`
- patch 时在 working AST 深度遍历 `data.diffId === hunk.id` 找到目标节点（`locateHunkInMdast`）

对应实现：
- `buildMergedMdast()` 会注册 hunk 并 `annotateNode(... diffId ...)`
- `MarkdownDiff.vue` 从 DOM 拿 `data-diff-id`
- `workingHunk.ts` 用 `locateHunkInMdast(root, hunkId)` 找节点

---

## 如何导出 finalMarkdown（以及为什么会踩坑）

### 为什么不能直接 `toMarkdown(workingMdast)`

merged/working 树里包含两类“非标准 mdast”：

1) **行内 `diff` 节点**（`type: 'diff'`，内部带 `diffType/value/originalNode`）  
2) **包装类型 `*-diff`**（例如 `paragraph-diff`、`code-diff`），用于让渲染阶段保留差异子节点

`mdast-util-to-markdown` 不认识 `type: 'diff'`，会抛：
> `Cannot handle unknown node 'diff'`

### 解决：导出前把展示树“规范化”为标准 mdast

`workingMdastToMarkdown()` 的策略（`workingHunk.ts`）：

- 递归遍历所有子节点
- 遇到 `type === 'diff'`：
  - `delete`：丢弃
  - `insert`：优先用 `originalNode` 还原格式（strong/em/inlineCode 等），否则退化为纯 text
- 遇到 `type.endsWith('-diff')`：还原成基础类型（如 `paragraph` / `code`），并继续清理 children
- 同时清除 `data/hProperties/dataDiffId` 等 diff 元数据

这一步的价值：让最终导出的 Markdown 只表达“内容”，不携带“展示层 diff 标记”。

---

## 细节问题与坑点（至少 6 个）

1) **双稿模式的竞态（Working 模式解决了）**  
   旧做法依赖父组件 props 回流，连续点击可能用到旧 AST，导致修改丢失。Working 模式 patch 内存单树，天然消除“回流竞态”。

2) **导出崩溃：unknown node 'diff'（已修复）**  
   如果只处理 `*-diff` 包装而漏掉普通段落 children 里的 `diff`，会直接白屏。修复方式是导出前全树 normalize。

3) **嵌套 hunk（表格 cell、列表项）**  
   hunk 可能出现在深层 children；必须按 `diffId` 深度遍历定位，而不是只看 root children。

4) **未处理 hunk 的导出语义**  
   当前实现是“按 working 树的可见内容导出”：insert 默认会在 final 里出现（除非 reject），delete 默认也会出现（除非 accept）。如果产品希望“未处理不导出”，需要额外策略。

5) **old/new 变化会 reset working**  
   `watch([oldMarkdown, newMarkdown], resetFromSources)` 会重置整轮 working；这对“对比页审阅 → 导出定稿”的场景合理，但不适合“边编辑边审阅且保留已审阅结果”的场景。

6) **id 稳定性与重算**  
   当前 working 流程里，hunk id 的稳定性主要用于“点击一次定位一次”；如果未来要支持“跨多次重算保留已处理列表”，需要更强的稳定 id 策略（例如基于结构锚点+内容签名）。

7) **性能：Phase 1 全页重渲染**  
   每次 accept/reject 都 `renderMdastToHtml(workingMdast)` 全量更新；大文档时可以优化成按 `data-diff-id` 局部替换 DOM。

---

## 性能与可扩展性（面试可加分）

### 当前取舍（为什么先全页重渲染）

- 逻辑更简单、稳定性更高
- Working 模式最大的收益来自“不再重跑 old/new 对齐算法”，渲染全量一般能接受

### 下一步优化（如果面试官问“还能怎么快”）

- **局部渲染**：只对被 patch 的那个 hunk 子树做 render，然后用 `data-diff-id` 定位 DOM 节点替换
- **分层缓存**：保留 working 子树到 HTML 的缓存（key = hunk.id + 子树 hash）
- **批量操作**：实现“全部接受/全部拒绝”时批量 patch，再只渲染一次

---

## 面试官追问 Q&A（现场口吻）

1) **问：点击接受/拒绝到底改了什么？**  
   答：我不改 old/new 两份源稿，我只改内存里的 working AST。accept 就把这个 hunk 对应节点替换成 newNode（或删除/保留），reject 就换成 oldNode。改完立刻重渲染，并把 working AST 序列化为 finalMarkdown。

2) **问：为什么不直接改 oldMarkdown/newMarkdown？**  
   答：双稿回流会产生竞态：用户连点时第二次计算可能还拿到第一次之前的旧 AST，容易覆盖丢修改；而 working 单树是同步 patch，顺序确定，不依赖父组件回流。

3) **问：你如何定位到要改的那块？**  
   答：不用 path 下标定位展示树，而是用 hunk.id。因为 merged 展示树里会插入 delete 节点，但 newAstIndex 不推进，导致数组下标与 new AST 不一致。我们在节点上打 `data-diff-id`，点击时从 DOM 拿 id，patch 时在 AST 里按 id 深度遍历定位节点。

4) **问：modified/insert/delete 的行为分别是什么？**  
   答：insert：accept=保留并去标，reject=删除；delete：accept=删除，reject=还原 oldNode；modified：accept=替换 newNode，reject=替换 oldNode。这个真值表在 `applyHunkToWorkingMdast` 里是固定的。

5) **问：最终 Markdown 怎么得到？**  
   答：working AST 是真源，但它包含展示层 diff 节点（比如行内 `diff`、`paragraph-diff`），不能直接 toMarkdown。导出时我会递归把这些节点还原成标准 mdast：diff-insert 还原 originalNode 或 text，diff-delete 丢弃，`*-diff` 还原基类型，同时清理 dataDiffId 元数据，然后再 mdastToMarkdown。

6) **问：没处理的 hunk 导出会怎样？**  
   答：当前导出“按 working 当前可见内容”来：insert 默认会在输出里出现，delete 也会出现（它本来就是展示树的一部分）。如果产品希望“未处理不落盘”，需要额外策略，比如把 delete 默认从导出过滤掉或强制先全部 resolve。

7) **问：表格/列表这种嵌套差异也能点吗？**  
   答：能。hunk 的 id 标注在子节点上，定位和 patch 是深度遍历；对嵌套 hunk 我通常用 oldNode/newNode 整棵替换来保证结构正确性，避免局部拼接产生非法 mdast。

8) **问：性能瓶颈在哪里？**  
   答：我们已经避免了每次点击都对 old/new 全量重跑对齐算法，剩下主要成本是 render 全量 HTML。Phase 1 我选择全量渲染保证简单稳定；如果要进一步优化可以做按 `data-diff-id` 局部 render+替换。

---

## 关联文件

- `src/components/markdownDiff/MarkdownDiff.vue`
- `src/components/markdownDiff/useMarkdownDiff.ts`
- `src/components/markdownDiff/workingHunk.ts`
- `src/components/markdownDiff/markdownDiff.ts`
- `docs/single-source-revision-mode-comparison.md`

