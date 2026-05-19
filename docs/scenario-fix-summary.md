# Markdown Diff 场景问题修复记录

## 问题一：标题级别变化时无红绿标记

### 场景

**场景02 — 标题：级别变化 h1→h2**

```markdown
# 旧：# Main Title        → 新：## Main Title
```

### 期望行为

旧标题 `# Main Title` 显示为红色（删除），新标题 `## Main Title` 显示为绿色（新增）。

### 实际行为

标题区域没有任何红/绿 diff 标记，视觉上看不出差异。

### 根因分析

当标题级别发生变化（如 h1→h2）时，LCS 算法因 `nodeKey` 中 heading 包含 depth 信息（`heading|d1` ≠ `heading|d2`），无法将两个标题匹配为"equal"，而是将旧标题标记为 `delete`，新标题标记为 `insert`。

diff 标记的渲染由 `rehypeDiffAnnotations` 插件负责，它会检查根层级元素是否带有 `dataDiffType` 属性，并将其包裹在 `diff-hunk` 容器中以显示红/绿样式。但包裹逻辑受 `WRAPPABLE_TAGS` 白名单限制——原始白名单为：

```typescript
const WRAPPABLE_TAGS = new Set([
  'p', 'span', 'strong', 'em', 'code', 'a', 'del', 'ins', 'text', 'pre', 'table',
])
```

`h1`~`h6`、`blockquote`、`ul`、`ol`、`li`、`hr`、`img`、`div` 等块级元素标签不在列表中，导致这些元素即使带有 diff 元信息也不会被包裹，红/绿样式无法生效。

### 解决方案

扩展 `WRAPPABLE_TAGS`，将所有可能承载 diff 的块级标签加入白名单：

```typescript
const WRAPPABLE_TAGS = new Set([
  'p', 'span', 'strong', 'em', 'code', 'a', 'del', 'ins', 'text', 'pre', 'table',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li', 'hr', 'img', 'div',
])
```

### 修改文件

- `src/utils/markdownDiff.ts` — `WRAPPABLE_TAGS` 常量

---

## 问题二：段落新增被错误匹配为修改

### 场景

**场景07 — 段落：新增段落**

```markdown
旧：                      新：
First paragraph.          First paragraph.
Third paragraph.          Second paragraph inserted.
                          Third paragraph.
```

### 期望行为

- 第 1 段 "First paragraph." → 无变化（unchanged）
- 第 2 段 "Second paragraph inserted." → 新增（insert，绿色）
- 第 3 段 "Third paragraph." → 无变化（unchanged）

### 实际行为

- 第 1 段 "First paragraph." ↔ "Second paragraph inserted." → 被错误匹配为修改（modified）
- 第 2 段 "Third paragraph." → 被标记为新增（insert）

### 根因分析

原始 LCS 算法采用**等权匹配**——所有通过 `canNodesMatch` 阈值检查的匹配对权重均为 1，DP 转移为：

```typescript
dp[i][j] = matched ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
```

在这个场景中：

| 匹配对 | 相似度 | 能否通过阈值(0.35) |
|--------|--------|-------------------|
| P1(old) ↔ P1(new) "First paragraph." ↔ "First paragraph." | 1.0 | ✅ |
| P1(old) ↔ P2(new) "First paragraph." ↔ "Second paragraph inserted." | ≈0.46 | ✅ |
| P2(old) ↔ P3(new) "Third paragraph." ↔ "Third paragraph." | 1.0 | ✅ |

两条 LCS 路径权重相同（均为 2）：
- **路径 A（正确）**：P1↔P1 + P2↔P3，权重 1+1=2
- **路径 B（错误）**：P1↔P2 + P2↔P3 不连续，实际 LCS 回溯从右下角优先走对角线时，先检查 P2(old)↔P3(new) 匹配成功，然后 P1(old)↔P2(new) 也匹配成功，形成错误路径

由于权重相等，回溯时先检查到的弱匹配被采纳，导致 P1 被错误匹配到 P2。

### 解决方案

将 LCS 算法从**等权匹配**改为**加权匹配**，使用文本相似度作为匹配权重：

1. **新增 `computeMatchWeight` 函数**：计算两个可匹配节点的权重（0~1），基于文本相似度

   ```typescript
   function computeMatchWeight(oldNode, newNode, autoMatchCodeLangs): number {
     // 自动匹配的代码块给予最高权重
     if (oldNode.type === 'code' && autoMatchCodeLangs.has(...)) return 1.0
     return computeTextSimilarity(oldText, newText)
   }
   ```

2. **修改 `buildDP`**：DP 转移使用权重而非固定 +1

   ```typescript
   dp[i][j] = matched
     ? Math.max(dp[i-1][j-1] + weight, dp[i-1][j], dp[i][j-1])
     : Math.max(dp[i-1][j], dp[i][j-1])
   ```

   同时返回权重矩阵 `weights`，供回溯使用。

3. **修改 `backtrackDiff`**：回溯时检查 DP 是否实际选中了该匹配

   ```typescript
   // 仅当 DP 实际选择了该匹配时才走对角线
   if (canMatch && Math.abs(dp[i][j] - (dp[i-1][j-1] + weights[i][j])) < EPS) {
     // 采纳匹配
   }
   ```

   而非仅检查 `canNodesMatch`，避免弱匹配在回溯时被错误采纳。

### 效果对比

| 匹配对 | 相似度 | 权重 |
|--------|--------|------|
| P1↔P1 "First paragraph." ↔ "First paragraph." | 1.0 | **1.0** |
| P1↔P2 "First paragraph." ↔ "Second paragraph inserted." | ≈0.46 | **0.46** |

加权 LCS 路径对比：
- **路径 A（正确）**：P1↔P1(1.0) + P2↔P3(1.0) = **2.0**
- **路径 B（错误）**：P1↔P2(0.46) + ... = 最多 ≈1.46

路径 A 权重更高，算法自然选择正确匹配。

### 修改文件

- `src/utils/markdownDiff.ts` — `mergeSubsequence`、`buildDP`、`backtrackDiff` 函数及新增 `computeMatchWeight` 函数

---

## 问题三：加粗切换为斜体时缺少 `<em>` 标签

### 场景

**场景13 — 行内：加粗切换为斜体**

```markdown
旧：This is **important** information.
新：This is *important* information.
```

### 期望行为

旧加粗 `<strong>important</strong>` 显示为红色（删除），新斜体 `<em>important</em>` 显示为绿色（新增）。

### 实际行为

输出为 `<del><strong>important</strong></del><ins>important</ins>`，`<ins>` 中缺少 `<em>` 标签，斜体格式丢失。

### 根因分析

mdast（Markdown AST）中斜体节点的 type 是 `"emphasis"`，而非 `"em"`。代码中多处错误地使用了 `'em'` 来判断斜体节点类型，导致两个连锁问题：

1. **`shouldFlattenToTextDiff` 误判路径**：该函数中的 `INLINE_TYPES` 集合缺少 `'emphasis'`，使得 `newHasInline`（新文本是否包含 inline 元素）计算为 false。函数误判为"一边有 inline 元素、一边没有"，触发了 `generateInlineStructureDiff` 路径而非 LCS 子节点对齐路径。

2. **`generateInlineStructureDiff` 丢失格式信息**：该路径在处理 insert 节点时不保留 `originalNode`，渲染时无法还原 `<em>` 标签。而正确的 LCS 路径会在 diff 节点中保存 `originalNode`，渲染时通过 `renderInlineNodeAsHtml` 还原格式标签。

### 解决方案

将所有 mdast 节点类型判断中的 `'em'` 改为 `'emphasis'`，共涉及 5 处：

| 位置 | 修改 | 作用 |
|------|------|------|
| `generateInlineStructureDiff` → `INLINE_TYPES` | `'em'` → `'emphasis'` | 正确识别斜体为 inline 元素 |
| `shouldFlattenToTextDiff` → `INLINE_TYPES` | `'em'` → `'emphasis'` | 修复路径判断，避免误入 flatten 路径 |
| `renderInlineNodeAsHtml` → `case` | `'em'` → `'emphasis'` | 正确匹配斜体节点并渲染 `<em>` 标签 |
| `mergeEqualNodes` → `INLINE_DIFF_TYPES` | `'em'` → `'emphasis'` | 正确识别斜体为 inline diff 类型 |
| `extractFormattedText` → 条件判断 | `'em'` → `'emphasis'` | 正确提取斜体节点的格式化文本 |

> 注意：`WRAPPABLE_TAGS` 中的 `'em'` 不需要修改，因为它是 HTML 标签名（hast 层），而非 mdast 节点类型。

### 额外修复

LCS 回溯时，当 `dp[i-1][j] == dp[i][j-1]` 的边界情况下，原始逻辑优先走上方（delete），但使用了 `>=` 判断导致等值时也走上方的优先级过高，调整为 `dp[i-1][j] > dp[i][j-1] + EPS`，确保等值时优先走左方（insert），unshift 后 delete 排在 insert 前面，符合 diff 惯例（先删后增）。

### 修复后效果

```html
<del class="diff-delete"><strong>important</strong></del><ins class="diff-insert"><em>important</em></ins>
```

### 修改文件

- `src/utils/markdownDiff.ts` — 5 处 `'em'` → `'emphasis'`，1 处 LCS 回溯偏好调整

---

## 问题四：表格行新增/删除无红绿标记

### 场景

**场景29 — 表格：新增行** / **场景30 — 表格：删除行**

```markdown
场景29（新增行）：
旧：| Name  | Score |       新：| Name  | Score |
    |-------|-------|               |-------|-------|
    | Alice | 85    |               | Alice | 85    |
                                      | Bob   | 92    |

场景30（删除行）：
旧：| Name  | Score |       新：| Name  | Score |
    |-------|-------|               |-------|-------|
    | Alice | 85    |               | Alice | 85    |
    | Bob   | 92    |
```

### 期望行为

- 场景29：Bob 行整行变绿（insert）
- 场景30：Bob 行整行变红（delete）

### 实际行为

表格被整体标记为 `modified`，新增/删除行没有行级红/绿样式，视觉上无法区分哪行是新增/删除的。

### 根因分析

涉及两层问题：

1. **mdast 层缺失行级 diff 标注**：`mergeEqualNodes` 对 insert/delete 的子节点处理中，`tableRow` 不在 `INLINE_DIFF_TYPES` 中，走的是 else 分支直接 `push(itemNode)`，没有添加 diff 元数据（`dataDiffType`/`dataDiffId`），导致 rehype 阶段无法识别行级变更。

2. **rehype 层无法用 `<div>` 包裹 `<tr>`**：`rehypeDiffAnnotations` 原逻辑对所有带 diff 元数据的元素统一用 `<div class="diff-hunk">` 包裹，但 `<tr>` 在 `<table>` 内不能被 `<div>` 包裹（HTML 语法限制），否则浏览器会拆分表格结构。

3. **CSS 缺少行级 insert 样式**：已有 `tr.diff-hunk--delete` 和 `tr.diff-hunk--modified` 样式，但缺少 `tr.diff-hunk--insert` 样式。

### 解决方案

**1. mdast 层：给 `tableRow`/`listItem` 添加 diff 标注**

在 `mergeEqualNodes` 的子节点循环中，对 insert/delete 的非 inline 子节点，判断其类型是否属于 `ANNOTATABLE_CHILD_TYPES`（`tableRow`、`listItem`），若是则用 `annotateNode` 添加 diff 元数据。

> 注意：`tableCell` 不在此列。因为当同一行有多个 cell 分别被标记为 delete 和 insert 时，remarkRehype 按列数生成 `<td>`，多余的 diff cell 会被截断导致内容丢失（如场景31"Score→Grade"中，"A" 单元格被截断）。Cell 级别应走文本 diff 而非行级标注。

**2. rehype 层：表格元素直接添加 CSS 类而非 `<div>` 包裹**

新增 `DIRECT_ANNOTATE_TAGS` 集合（`tr`、`td`、`th`、`thead`、`tbody`、`tfoot`），对这些标签直接添加 diff CSS 类（如 `diff-hunk--insert`、`diff-hunk--delete`），跳过 `<div>` 包裹和工具栏注入。

**3. CSS：新增 `tr.diff-hunk--insert` 样式**

```css
.markdown-diff-content :deep(tbody tr.diff-hunk--insert) {
  background: rgba(16, 185, 129, 0.1);
}
```

### 修复后效果

```html
<!-- 场景29：新增行 -->
<tr class="diff-hunk--insert"><td>Bob</td><td>92</td></tr>

<!-- 场景30：删除行 -->
<tr class="diff-hunk--delete"><td>Bob</td><td>92</td></tr>
```

### 修改文件

- `src/utils/markdownDiff.ts` — `mergeEqualNodes` 添加 `ANNOTATABLE_CHILD_TYPES` 行级标注；`rehypeDiffAnnotations` 添加 `DIRECT_ANNOTATE_TAGS` 直接标注逻辑
- `src/components/MarkdownDiff.vue` — 新增 `tr.diff-hunk--insert` CSS 样式

---

## 问题五：表格单元格内容变更未标记修改

### 场景

**场景31 — 表格：单元格内容变更**

```markdown
旧：| Name  | Score |       新：| Name  | Grade |
    |-------|-------|               |-------|-------|
    | Alice | 85    |               | Alice | A     |
```

### 期望行为

- 表头 "Score" → "Grade"：标记为修改（红色删除 + 绿色新增）
- 最后一行 "85" → "A"：标记为修改（`<del>85</del><ins>A</ins>`）

### 实际行为

表头修改渲染正常，但最后一行最后一列 "85" → "A" 没有任何 diff 标记，视觉上看不出变化。

### 根因分析

`mergeEqualNodes` 对 `tableRow` 的子节点（`tableCell`）使用通用 LCS 算法进行匹配。LCS 基于文本相似度自由配对，不考虑列位置约束。当同一列的 cell 内容差异较大时（如 "85" 与 "A" 相似度很低），LCS 会将它们视为不相关的节点，分别标记为独立的 delete 和 insert，而非同一列的"修改"。

更严重的是，当一行中多个 cell 被拆成 delete/insert 时，产生的 cell 数量超出原始列数。remark-rehype 按表格列数生成 `<td>`，多余的 diff cell 会被截断，导致内容丢失（如 "A" 单元格消失）。

### 解决方案

在 `mergeEqualNodes` 中为 `tableRow` 添加按列位置配对的特殊处理，跳过 LCS 匹配：

```typescript
if (oldNode.type === 'tableRow' && newNode.type === 'tableRow') {
  let rowChanged = false
  const rowChildren: MdastNode[] = []
  const maxLen = Math.max(oldChildren.length, newChildren.length)
  for (let i = 0; i < maxLen; i++) {
    const oldCell = oldChildren[i]
    const newCell = newChildren[i]
    if (oldCell && newCell) {
      // 同列 cell 递归合并，产生文本级 <del>/<ins>
      const sub = mergeEqualNodes(oldCell, newCell, mode, config)
      if (sub.changed) rowChanged = true
      rowChildren.push(sub.node)
    } else if (newCell) {
      // 新增列
      rowChanged = true
      rowChildren.push(annotateNode(stripMeta(newCell), '', 'insert'))
    } else if (oldCell) {
      // 删除列
      rowChanged = true
      rowChildren.push(annotateNode(stripMeta(oldCell), '', 'delete'))
    }
  }
  return { node: { ...stripMeta(newNode), children: rowChildren }, changed: rowChanged }
}
```

关键设计：

- **按列索引配对**：`oldCell[0]` ↔ `newCell[0]`，`oldCell[1]` ↔ `newCell[1]`，而非 LCS 自由匹配
- **递归 `mergeEqualNodes`**：配对后的 cell 继续走正常的文本 diff 流程，产生 `<del>/<ins>` 标记
- **列数不等时**：多余的旧列标记 delete，多余的新列标记 insert
- **`tableCell` 不加入 `ANNOTATABLE_CHILD_TYPES`**：避免 cell 被整体标注导致列数溢出截断

### 修复后效果

```html
<!-- "85" → "A" -->
<td><del class="diff-delete">85</del><ins class="diff-insert">A</ins></td>
```

### 修改文件

- `src/utils/markdownDiff.ts` — `mergeEqualNodes` 添加 `tableRow` 按列位置配对逻辑

---

## 问题六：无序列表新增/删除项无红绿标记

### 场景

**场景32 — 列表：无序列表新增项** / **场景33 — 列表：无序列表删除项**

```markdown
场景32（新增项）：
旧：- Apple           新：- Apple
    - Banana               - Banana
    - Cherry               - Date
                           - Cherry

场景33（删除项）：
旧：- Apple           新：- Apple
    - Banana               - Cherry
    - Cherry               - Date
    - Date
```

### 期望行为

- 场景32："Date" 列表项整行变绿（insert）
- 场景33："Banana" 列表项整行变红（delete）

### 实际行为

列表被整体标记为 `modified`，新增/删除项没有项级红/绿样式，视觉上无法区分哪项是新增/删除的。

### 根因分析

与表格行（问题四）相同模式，涉及两层：

1. **mdast 层**：`listItem` 已在 `ANNOTATABLE_CHILD_TYPES` 中，通过 `annotateNode` 添加了 `dataDiffType`/`dataDiffId` 元数据，这部分逻辑已就绪。

2. **rehype 层**：`<li>` 不在 `DIRECT_ANNOTATE_TAGS` 中，且 `<li>` 作为 `<ul>/<ol>` 的子元素（`parent !== tree`），被 `rehypeDiffAnnotations` 的 `parent !== tree` 条件跳过，导致 diff CSS 类未被添加。

3. **CSS 层**：缺少 `li.diff-hunk--insert` 样式。

### 解决方案

**1. rehype 层：将 `<li>` 加入 `DIRECT_ANNOTATE_TAGS`**

`<li>` 在 `<ul>/<ol>` 内不能被 `<div>` 包裹（HTML 语法限制），与 `<tr>` 在 `<table>` 内的限制相同。将其加入 `DIRECT_ANNOTATE_TAGS`，直接添加 diff CSS 类：

```typescript
const DIRECT_ANNOTATE_TAGS = new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'li'])
```

**2. CSS：新增 `li.diff-hunk--insert` 样式**

```css
.markdown-diff-content :deep(li.diff-hunk--insert) {
  background: rgba(16, 185, 129, 0.1);
}

.markdown-diff-content :deep(li.diff-hunk--delete),
.markdown-diff-content :deep(li.diff-hunk--modified) {
  background: rgba(239, 68, 68, 0.06);
}
```

### 修复后效果

```html
<!-- 场景32：新增项 -->
<li class="diff-hunk--insert">Date</li>

<!-- 场景33：删除项 -->
<li class="diff-hunk--delete">Banana</li>
```

### 修改文件

- `src/utils/markdownDiff.ts` — `DIRECT_ANNOTATE_TAGS` 添加 `'li'`
- `src/components/MarkdownDiff.vue` — 新增 `li.diff-hunk--insert`、`li.diff-hunk--delete`、`li.diff-hunk--modified` CSS 样式

---

## 问题七：无序列表↔有序列表切换无 diff 标记

### 场景

**场景37 — 列表：有序↔无序切换**

```markdown
旧：- Apple          新：1. Apple
    - Banana             2. Banana
    - Cherry             3. Cherry
```

### 期望行为

旧无序列表显示为红色（delete），新有序列表显示为绿色（insert）。

### 实际行为

列表区域没有任何红/绿 diff 标记，视觉上看不出差异。

### 根因分析

与问题一（标题级别变化）相同的模式：

1. **`nodeKey` 未区分 `ordered` 属性**：`nodeKey` 对 `list` 类型仅使用 `node.type`（即 `"list"`），不包含 `ordered` 属性。导致无序列表和有序列表的 key 相同（`"list"`），LCS 认为它们结构一致。

2. **`canNodesMatch` 未检查 `ordered` 属性**：该函数的类型检查中没有 `list` 的 case，仅比较 `node.type` 是否相同。`list` 类型匹配后直接进入相似度计算，而内容完全相同的列表（如 "Apple/Banana/Cherry"）相似度为 1.0，通过阈值检查。

3. 结果是 LCS 将旧无序列表和新有序列表匹配为 "equal"，`mergeEqualNodes` 递归比较子节点时内容完全相同，`changed=false`，不产生任何 diff 标记。

### 解决方案

与 heading 的 `depth` 处理方式一致——让 `ordered` 不同的列表不匹配：

**1. `nodeKey`：为 `list` 类型添加 `ordered` 标识**

```typescript
case 'list':
  parts.push(`o${node.ordered ? 1 : 0}`)
  break
```

这使得 `list|o0`（无序）和 `list|o1`（有序）的 key 不同，LCS 不会将它们视为同结构节点。

**2. `canNodesMatch`：为 `list` 类型添加 `ordered` 属性检查**

```typescript
case 'list':
  if (oldNode.ordered !== newNode.ordered) return false
  break
```

即使 key 偶尔相同，`canNodesMatch` 也会拒绝 `ordered` 不同的列表匹配。

### 修复后效果

```html
<!-- 旧无序列表 → 红色 -->
<div class="diff-hunk diff-hunk--delete">
  <ul><li>Apple</li><li>Banana</li><li>Cherry</li></ul>
</div>

<!-- 新有序列表 → 绿色 -->
<div class="diff-hunk diff-hunk--insert">
  <ol><li>Apple</li><li>Banana</li><li>Cherry</li></ol>
</div>
```

### 修改文件

- `src/utils/markdownDiff.ts` — `nodeKey` 添加 `list` 的 `ordered` 标识；`canNodesMatch` 添加 `list` 的 `ordered` 属性检查

---

## 问题八：链接变化无 diff 标记

### 场景

**场景39 — 链接：URL变化**

```markdown
旧：Visit [our website](https://old.example.com) for details.
新：Visit [our website](https://new.example.com) for details.
```

### 期望行为

旧链接 `<a href="https://old.example.com">our website</a>` 显示为红色（delete），新链接 `<a href="https://new.example.com">our website</a>` 显示为绿色（insert）。

### 实际行为

链接区域没有任何红/绿 diff 标记，视觉上看不出差异。

### 根因分析

与问题三（加粗切换斜体缺 `<em>` 标签）完全同构——mdast 中链接节点的 type 是 `"link"`，而非 HTML 标签名 `"a"`。代码中三处 `INLINE_TYPES` / `INLINE_DIFF_TYPES` 错误地使用了 `'a'`，导致两个连锁问题：

1. **`shouldFlattenToTextDiff` 误判路径**：`INLINE_TYPES` 中缺少 `'link'`，使得包含链接的段落被误判为"一边有 inline 元素、一边没有"，触发 `generateInlineStructureDiff` 路径而非 LCS 子节点对齐路径。

2. **`mergeEqualNodes` 未识别链接为 inline diff 类型**：`INLINE_DIFF_TYPES` 中缺少 `'link'`，链接节点在 insert/delete 时走 else 分支直接 `push(itemNode)`，没有生成 `<del>/<ins>` 标记。

3. **`generateInlineStructureDiff` 未识别链接为 inline 元素**：同上的 `INLINE_TYPES` 缺少 `'link'`，链接不会被当作 inline 元素处理。

### 解决方案

将三处 `'a'` 改为 `'link'`：

| 位置 | 修改 | 作用 |
|------|------|------|
| `generateInlineStructureDiff` → `INLINE_TYPES` | `'a'` → `'link'` | 正确识别链接为 inline 元素 |
| `shouldFlattenToTextDiff` → `INLINE_TYPES` | `'a'` → `'link'` | 修复路径判断，避免误入 flatten 路径 |
| `mergeEqualNodes` → `INLINE_DIFF_TYPES` | `'a'` → `'link'` | 正确识别链接为 inline diff 类型 |

> 注意：`WRAPPABLE_TAGS` 和 `renderInlineNodeAsHtml` 中的 `'a'` 不需要修改，因为它们操作的是 HTML 标签名（hast 层），而非 mdast 节点类型。

### 修复后效果

```html
Visit <del class="diff-delete"><a href="https://old.example.com">our website</a></del><ins class="diff-insert"><a href="https://new.example.com">our website</a></ins> for details.
```

### 修改文件

- `src/utils/markdownDiff.ts` — 3 处 `'a'` → `'link'`

---

## 问题九：代码块删除/新增无红绿标记

### 场景

**场景57 — 代码块：删除**

```markdown
旧：Here is the algorithm.          新：Here is the algorithm.

    ```python                            That is all.
    def sort(arr):
        return sorted(arr)
    ```

    That is all.
```

### 期望行为

被删除的代码块整块显示红色背景（delete），新增的代码块整块显示绿色背景（insert）。

### 实际行为

代码块区域没有任何红/绿 diff 标记，视觉上看不出差异。HTML 输出中 `<pre>` 有 `data-diff-type="delete"` 属性，但没有被包裹在 `<div class="diff-hunk diff-hunk--delete">` 中。

### 根因分析

`rehypeDiffAnnotations` 中，`<pre>` 标签的 diff 元数据传播逻辑存在执行顺序问题：

1. remark-rehype 将 mdast `code` 节点的 hProperties（含 `dataDiffId`/`dataDiffType`）放在 `<code>` 子元素上，而非 `<pre>` 父元素上。

2. 代码中已有将 `<code>` 的 diff 属性传播到 `<pre>` 的逻辑，但这段逻辑位于 `if (!diffType || diffType === 'unchanged') return` **之后**。

3. 执行流程：
   - `getDiffMeta(node)` 读取 `<pre>` 的 diff 属性 → 空
   - `if (!diffType || diffType === 'unchanged') return` → 直接返回
   - 传播逻辑永远不会执行

4. 结果是 `<pre>` 永远拿不到 diff 元数据，不会被 `wrapHunk` 包裹成 `<div class="diff-hunk diff-hunk--delete">`。

### 解决方案

将 `<pre>` 的子 `<code>` diff 属性传播逻辑移到 `diffType` 检查之前：

```typescript
// 先传播 <pre> 的子 <code> diff 属性（移动到最前面）
if (node.tagName === 'pre' && node.children) {
  const codeChild = node.children.find(
    (child) => child.type === 'element' && child.tagName === 'code'
  )
  if (codeChild) {
    const { diffId, diffType } = getDiffMeta(codeChild)
    if (diffId && diffType && diffType !== 'unchanged') {
      // 传播到 <pre> 的 data 和 properties
      if (!node.data) node.data = {}
      node.data.diffId = diffId
      node.data.diffType = diffType
      if (!node.properties) node.properties = {}
      node.properties.dataDiffId = diffId
      node.properties.dataDiffType = diffType
    }
  }
}

// 然后再读取 <pre> 的 diff 属性（此时已包含传播来的值）
const { diffId, diffType } = getDiffMeta(node)
if (!diffType || diffType === 'unchanged') return
// ... 后续 wrap 逻辑
```

### 修复后效果

```html
<!-- 删除的代码块 → 红色 -->
<div class="diff-hunk diff-hunk--delete" data-diff-id="1">
  <pre data-diff-id="1" data-diff-type="delete">
    <code class="language-python">def sort(arr):
    return sorted(arr)</code>
  </pre>
</div>

<!-- 新增的代码块 → 绿色 -->
<div class="diff-hunk diff-hunk--insert" data-diff-id="1">
  <pre data-diff-id="1" data-diff-type="insert">
    <code class="language-python">def sort(arr):
    return sorted(arr)</code>
  </pre>
</div>
```

### 修改文件

- `src/utils/markdownDiff.ts` — `rehypeDiffAnnotations` 中将 `<pre>` 子 `<code>` diff 属性传播逻辑移到 `diffType` 检查之前

---

## 问题十：inline结构退化时 diff 标记位置错误

### 场景

**场景60 — 混合：inline结构退化（纯文本→加粗）**

```markdown
旧：The highlight of the show was the finale.
新：The **highlight** of the show was the finale.
```

### 期望行为

`<del>highlight</del><ins><strong>highlight</strong></ins>` 出现在 "The" 和 "of" 之间，就地标记结构变化。

### 实际行为

```html
The highlight of the show was the finale.<del>highlight</del><ins><strong>highlight</strong></ins>
```

"highlight" 出现两次——一次在原位作为纯文本，一次在段落末尾作为 diff 标记。

### 根因分析

`generateInlineStructureDiff` 只处理了"旧有inline→新纯文本"的方向（旧inline标del，新纯文本标ins），没有处理"旧纯文本→新有inline"的方向。

当旧侧全是纯文本、新侧有inline元素时：
1. 旧侧的纯text节点被原样 `push` 到 result 中（第304行 `result.push(stripMeta(oldChild))`）
2. 新侧的inline元素在末尾的"新多出inline"循环中被追加
3. 结果是旧文本完整出现在前面，diff标记被追加到段落末尾

### 解决方案

新增 `!oldHasInline && newHasInline` 分支：以新侧子节点为框架，在旧侧完整文本中用游标按位置对齐，遇到新inline元素时从旧文本对应位置取出等长文本，就地插入 `del+ins`：

```typescript
if (!oldHasInline && newHasInline) {
  // 旧侧全是纯文本，新侧有 inline 元素
  const oldFullText = oldChildren.map((c) => String(c.value ?? '')).join('')
  let oldOffset = 0

  for (const newChild of newChildren) {
    const newText = newChild.type === 'text'
      ? String(newChild.value ?? '')
      : extractTextFromNode(newChild)

    if (newChild.type === 'text') {
      // 公共纯文本 → 直接输出
      result.push({ type: 'text', value: newText })
    } else if (INLINE_TYPES.has(newChild.type)) {
      // 新 inline 元素 → 从旧文本对应位置取出等长文本，标记结构变化
      const oldPart = oldFullText.substring(oldOffset, oldOffset + newText.length)
      result.push({ type: 'diff', diffType: 'delete', value: oldPart })
      result.push({ type: 'diff', diffType: 'insert', value: newText, originalNode: newChild })
      changed = true
    }
    oldOffset += newText.length
  }

  return { children: result, changed }
}
```

### 修复后效果

```html
<!-- 纯文本→加粗 -->
The <del class="diff-delete">highlight</del><ins class="diff-insert"><strong>highlight</strong></ins> of the show was the finale.

<!-- 加粗→纯文本（原有逻辑，不受影响） -->
The <del class="diff-delete"><strong>highlight</strong></del><ins class="diff-insert">highlight</ins> of the show was the finale.
```

### 修改文件

- `src/utils/markdownDiff.ts` — `generateInlineStructureDiff` 新增 `!oldHasInline && newHasInline` 分支，以新侧为框架按游标对齐旧文本

---

## 问题十一：嵌套 inline 格式渲染不完整

### 场景

**场景62 — 混合：嵌套格式 \*\*\*bold+italic\*\*\***

```markdown
旧：This is ***really important*** information.
新：This is **really important** information.
```

### 期望行为

旧侧 `***really important***` 渲染为 `<del><em><strong>really important</strong></em></del>`（加粗+斜体红色），新侧 `**really important**` 渲染为 `<ins><strong>really important</strong></ins>`（加粗绿色）。

### 实际行为

旧侧 `<del>` 中只渲染了 `<em>really important</em>`（斜体红色），缺少外层 `<strong>`，视觉上加粗效果丢失。

### 根因分析

`renderInlineNodeAsHtml` 只渲染最外层的 inline 节点标签。当 mdast 解析 `***really important***` 时，产生嵌套结构：

```
strong → emphasis → text("really important")
```

LCS 匹配时，旧侧 `strong` 节点的 `originalNode` 传给 `renderInlineNodeAsHtml`，它只渲染外层 `<strong>`，内部的 `emphasis` 子节点被忽略，其文本内容直接作为 `escapedText` 参数，`<em>` 标签丢失。

### 解决方案

新增 `renderInlineNodeTreeAsHtml` 函数，递归渲染 inline 节点及其子节点：

```typescript
function renderInlineNodeTreeAsHtml(node: MdastNode): string {
  const INLINE_TYPES = new Set(['strong', 'emphasis', 'link', 'inlineCode', 'delete', 'image'])

  if (node.type === 'text') {
    return escapeHtml(String(node.value ?? ''))
  }

  if (!INLINE_TYPES.has(node.type)) {
    return escapeHtml(extractTextFromNode(node))
  }

  // 递归渲染子节点
  const children = (node.children as MdastNode[] | undefined) ?? []
  const innerHtml = children.map((child) => renderInlineNodeTreeAsHtml(child)).join('')
  return renderInlineNodeAsHtml(node, innerHtml)
}
```

然后在 `normalizeDiffNodes` 中将 `renderInlineNodeAsHtml(originalNode, text)` 替换为 `renderInlineNodeTreeAsHtml(originalNode)`。

### 修复后效果

```html
<!-- 修复前 -->
<del class="diff-delete"><em>really important</em></del>

<!-- 修复后 -->
<del class="diff-delete"><em><strong>really important</strong></em></del>
```

### 修改文件

- `src/utils/markdownDiff.ts` — 新增 `renderInlineNodeTreeAsHtml` 递归渲染函数；`normalizeDiffNodes` 改用该函数渲染嵌套 inline 格式

---

## 问题 12：代码高亮后 diff 红绿标记消失

### 问题描述

添加 `rehype-highlight` 语法高亮后，代码块内的红绿色 diff 标记（`<del>`/`<ins>`）不再显示，所有代码块只剩语法高亮着色，变更内容无法区分。

### 实际行为

代码块中只有 hljs 语法高亮的 `<span class="hljs-keyword">` 等标签，`<del class="diff-delete">` 和 `<ins class="diff-insert">` 标记被完全覆盖。

### 根因分析

`rehype-highlight` 在处理 `<pre><code>` 元素时，会用 lowlight 生成的语法高亮 span **替换** `<code>` 的所有子节点（`node.children = result.children`）。这导致 `normalizeDiffNodes` 之前插入到代码内容中的 `<del>`/`<ins>` diff 标记被整体丢失。

处理管线顺序为：`remarkRehype → rehypeRaw → rehypeHighlight → rehypeDiffAnnotations → rehypeStringify`，`rehype-highlight` 在 diff 标注之前执行，已经把 `<del>`/`<ins>` 清除了。

### 解决方案

在 `normalizeDiffNodes` 阶段（rehype 处理之前）使用 lowlight 直接调用对每个文本段单独进行语法高亮，保留 `<del>`/`<ins>` 包裹标记：

1. **新增 `highlightCodeText` 函数**：使用 `lowlight.highlight(lang, text)` 生成 hast 树，再通过 `hast-util-to-html` 的 `toHtml()` 转为 HTML 字符串。

```typescript
import { createLowlight, common as lowlightCommon } from 'lowlight'
import { toHtml } from 'hast-util-to-html'

const lowlight = createLowlight(lowlightCommon)

function highlightCodeText(text: string, lang: string): string {
  if (!lang) return escapeHtml(text)
  try {
    const tree = lowlight.highlight(lang, text)
    return toHtml(tree)
  } catch {
    return escapeHtml(text)
  }
}
```

2. **在 `code-diff` 节点处理中对每个文本段分别高亮**：

```typescript
// diff 段：高亮 + 保留标记
const highlighted = highlightCodeText(rawText, lang)
return `<${tag} class="${cls}">${highlighted}</${tag}>`

// 未变更段：仅高亮
return highlightCodeText(rawText, lang)
```

3. **添加 `no-highlight` 类阻止 rehype-highlight 重复处理**：

`rehype-highlight` 检测到 `no-highlight` / `nohighlight` CSS 类会跳过该元素。在已手动高亮的 `<code>` 元素上添加此类：

```typescript
const classList = ['hljs']
if (lang) classList.push(`language-${lang}`)
classList.push('no-highlight')  // 关键：阻止 rehype-highlight 覆盖
```

### 修复后效果

```html
<!-- 修复前：rehype-highlight 覆盖了 diff 标记 -->
<code class="hljs language-javascript">
  <span class="hljs-keyword">function</span> calculateTotal(price) { ... }
</code>

<!-- 修复后：手动高亮 + diff 标记共存 -->
<code class="hljs language-javascript no-highlight" data-diff-id="4" data-diff-type="modified">
  <span class="hljs-keyword">function</span> calculateTotal(price) {
  <ins class="diff-insert">  <span class="hljs-keyword">const</span> tax = <span class="hljs-number">0.08</span>;\n</ins>
  <ins class="diff-insert"> * (<span class="hljs-number">1</span> + tax)</ins>
</code>
```

### 修改文件

- `src/utils/markdownDiff.ts` — 新增 `lowlight` 实例和 `highlightCodeText()` 函数；修改 `code-diff` 节点处理逻辑，对每个文本段单独高亮并添加 `no-highlight` 类

---

## 问题 13：点击"接受"按钮无反应

### 问题描述

在 diff 面板中，点击"拒绝"按钮可以正常消除 diff 标记，但点击"接受"按钮后 diff 标记没有任何变化，页面内容保持不变。

### 实际行为

点击"接受"后，`newMarkdown` 被更新但值不变（因为 accept 操作本意不是修改 newMarkdown），diff 重新计算后结果与之前完全一致，视觉上毫无变化。

### 根因分析

`applyHunkResolution` 函数只在 `newAst` 上操作：

| diffType | accept 操作 | 实际效果 |
|----------|-----------|---------|
| `insert` | 无操作 | `newAst` 不变，`newMarkdown` 不变 → diff 不消失 |
| `delete` | 无操作 | `newAst` 不变，`newMarkdown` 不变 → diff 不消失 |
| `modified` | 用 `hunk.newNode` 替换 `newAst` 中对应节点 | 替换的是与当前节点相同的节点 → `newMarkdown` 不变 → diff 不消失 |

**核心问题**：accept 的语义是"让旧版本接受新版本的变更"，应该修改 `oldMarkdown` 使其与 `newMarkdown` 一致，而不是修改 `newMarkdown`。旧代码只在 `newAst` 上操作，对 accept 来说是无效的。

而 reject 的语义是"拒绝新版本的变更，恢复旧版本内容"，修改 `newMarkdown` 是正确的，所以 reject 能正常工作。

### 解决方案

1. **`DiffHunk` 类型新增 `oldIndex` 和 `oldPath`**：记录 hunk 在旧 AST 中的位置，用于 accept 时定位 oldAst 中的节点。

```typescript
export type DiffHunk = {
  // ...existing fields
  oldIndex: number    // 该 hunk 在旧 AST 中的位置
  oldPath: number[]   // 该 hunk 在旧 AST 中的路径
}
```

2. **`buildMergedFromDiff` 跟踪 `oldAstIndex`**：在构建 hunk 时同步记录旧 AST 的位置索引。

```typescript
let newAstIndex = 0
let oldAstIndex = 0  // 新增

// insert: oldAstIndex 不递增（旧 AST 无此节点）
// delete: oldAstIndex++ 但 newAstIndex 不递增（新 AST 无此节点）
// equal/modified: 两者都递增
```

3. **新增 `applyHunkAcceptOnOldAst` 函数**：对 oldAst 执行 accept 操作，使旧版本内容与该 hunk 的新版本内容一致。

```typescript
export function applyHunkAcceptOnOldAst(oldAst: Root, hunk: DiffHunk): Root {
  const result = cloneNode(oldAst)
  const children = [...(result.children ?? [])]
  const targetIndex = findNodeByPath(children, hunk.oldPath) ?? hunk.oldIndex

  switch (hunk.diffType) {
    case 'insert':
      // 将新增节点插入到旧 AST
      if (hunk.newNode && targetIndex != null)
        children.splice(targetIndex, 0, cloneNode(hunk.newNode))
      break
    case 'delete':
      // 从旧 AST 中移除被删除的节点
      if (targetIndex != null) children.splice(targetIndex, 1)
      break
    case 'modified':
      // 用新版本节点替换旧版本节点
      if (targetIndex != null && hunk.newNode)
        children[targetIndex] = cloneNode(hunk.newNode)
      break
  }
  result.children = children
  return result
}
```

4. **`MarkdownDiff.vue` 区分 accept/reject 操作**：

```typescript
if (action === 'accept') {
  // 接受变更：修改 oldMarkdown 使其与该 hunk 的新版本内容一致
  const oldAst = parseMarkdown(props.oldMarkdown)
  const patchedOld = applyHunkAcceptOnOldAst(oldAst, hunk)
  emit('update:oldMarkdown', mdastToMarkdown(patchedOld))
} else {
  // 拒绝变更：修改 newMarkdown 恢复旧版本内容
  const newAst = parseMarkdown(props.newMarkdown)
  const patched = applyHunkResolution(newAst, hunk, action)
  emit('update:newMarkdown', mdastToMarkdown(patched))
}
```

5. **`MarkdownDiff.vue` 新增 `update:oldMarkdown` 事件**，**`App.vue` 绑定 `@update:old-markdown`**。

### 修复后效果

| 操作 | diffType | 修改对象 | 效果 |
|------|----------|---------|------|
| 接受 | insert | oldMarkdown（插入新节点） | 旧侧出现新内容，diff 消失 |
| 接受 | delete | oldMarkdown（移除旧节点） | 旧侧移除内容，diff 消失 |
| 接受 | modified | oldMarkdown（替换为新节点） | 旧侧更新为新内容，diff 消失 |
| 拒绝 | insert | newMarkdown（移除新节点） | 新侧移除内容，diff 消失 |
| 拒绝 | delete | newMarkdown（恢复旧节点） | 新侧恢复旧内容，diff 消失 |
| 拒绝 | modified | newMarkdown（替换为旧节点） | 新侧恢复旧内容，diff 消失 |

### 修改文件

- `src/utils/markdownDiff.ts` — `DiffHunk` 类型新增 `oldIndex`/`oldPath`；`buildMergedFromDiff` 跟踪 `oldAstIndex`；新增 `applyHunkAcceptOnOldAst` 函数
- `src/components/MarkdownDiff.vue` — 新增 `update:oldMarkdown` 事件；`onContentClick` 中 accept 走 `applyHunkAcceptOnOldAst` + emit `update:oldMarkdown`，reject 走原逻辑
- `src/App.vue` — 绑定 `@update:old-markdown="oldMarkdown = $event"`

---

## 总结

| 问题 | 根因 | 解决方案 | 影响范围 |
|------|------|---------|---------|
| 标题级别变化无标记 | `WRAPPABLE_TAGS` 白名单缺少块级标签 | 扩展白名单加入 h1~h6 等标签 | 所有块级元素的 insert/delete 标记 |
| 段落新增被误匹配 | LCS 等权匹配，弱匹配与强匹配权重相同 | 改为加权 LCS，用文本相似度作权重 | 所有涉及模糊匹配的节点对齐 |
| 加粗切换斜体缺 `<em>` 标签 | mdast 斜体类型是 `emphasis` 而非 `em`，代码多处类型名错误 | 全局修正 `'em'` → `'emphasis'`，调整 LCS 回溯偏好 | 所有斜体相关的 diff 渲染 |
| 表格行增删无红绿标记 | 行级 diff 标注缺失 + `<tr>` 不能被 `<div>` 包裹 | 行级 `annotateNode` + rehype 直接添加 CSS 类 + 补全 insert 样式 | 表格行的 insert/delete 渲染 |
| 表格单元格内容变更未标记 | LCS 自由匹配 cell 忽略列位置，差异大的 cell 被拆为独立 delete/insert 后被截断 | `tableRow` 子节点按列位置配对而非 LCS，递归走文本 diff | 表格单元格级别的文本 diff 渲染 |
| 无序列表增删项无红绿标记 | `<li>` 不能被 `<div>` 包裹，且 `parent !== tree` 被跳过 | `DIRECT_ANNOTATE_TAGS` 添加 `'li'` + 补全 insert/delete CSS 样式 | 列表项的 insert/delete 渲染 |
| 无序↔有序列表切换无标记 | `nodeKey` 和 `canNodesMatch` 未区分列表的 `ordered` 属性 | `nodeKey` 添加 `ordered` 标识 + `canNodesMatch` 添加 `ordered` 属性检查 | 有序/无序列表的切换 diff 渲染 |
| 链接变化无 diff 标记 | mdast 链接类型是 `link` 而非 `a`，代码多处类型名错误 | 3 处 `'a'` → `'link'` | 所有链接相关的 diff 渲染 |
| 代码块删除/新增无红绿标记 | `<pre>` 的 `<code>` diff 属性传播逻辑在 `diffType` 检查之后，提前返回导致传播不执行 | 将传播逻辑移到 `diffType` 检查之前 | 代码块的 insert/delete 渲染 |
| inline结构退化diff标记位置错误 | `generateInlineStructureDiff` 只处理旧→新纯文本方向，旧纯文本→新inline时文本被原样输出、diff标记追加到末尾 | 新增 `!oldHasInline && newHasInline` 分支，以新侧为框架按游标对齐旧文本就地标记 | 纯文本↔加粗/斜体等inline结构变化的diff渲染 |
| 嵌套inline格式渲染不完整 | `renderInlineNodeAsHtml` 只渲染最外层标签，嵌套子节点的格式标签丢失 | 新增 `renderInlineNodeTreeAsHtml` 递归渲染嵌套 inline 节点 | 所有嵌套 inline 格式（如加粗+斜体）的 diff 渲染 |
| 代码高亮后diff标记消失 | `rehype-highlight` 用高亮 span 替换 `<code>` 全部子节点，覆盖 `<del>`/`<ins>` | lowlight 逐段手动高亮 + `no-highlight` 类阻止 rehype-highlight 重复处理 | 代码块内变更的 diff 红绿标记渲染 |
| 点击"接受"按钮无反应 | `applyHunkResolution` 只修改 `newAst`，accept 操作需修改 `oldAst` 使 diff 消失 | 新增 `applyHunkAcceptOnOldAst` 修改 oldAst + `DiffHunk` 记录 `oldIndex`/`oldPath` + accept 时 emit `update:oldMarkdown` | 所有 hunk 的 accept 操作 |
