# 面试答题稿：表格列映射是如何实现的

> **使用场景**：面试官追问"表格增删列你怎么 diff？为什么 tableRow 按位置、table 又要列映射？"时的标准答案模板。
>
> **核心心法**：表格 diff 是 **「行用 LCS、列用表头映射」** 的两层策略——按 **「问题动机 → 三层流程 → 列映射算法 → 行合并 walkthrough → 难点与优化 → 手算例子」** 六层往下讲。

---

## 第 1 层：一句话定义（15 秒）

> "整张表在 **table** 级别用**第一行表头文本**算出旧列↔新列的全局映射；**equal 的每一行**都按这份映射合并单元格——匹配列做内容 diff，删除列标红，新增列标绿。单行 **tableRow** 则只按下标配对，因为列映射必须在表级才算一次，否则删中间列会把右边列全配错。"

---

## 第 2 层：为什么需要列映射？（动机 + 反例）

### 如果只按列下标配对会怎样？

旧表 3 列，新表删掉中间「年龄」：

| 旧 | 姓名 | 年龄 | 部门 |
|----|------|------|------|
|    | 张三 | 25   | 研发 |

| 新 | 姓名 | 部门 |
|----|------|------|
|    | 张三 | 研发 |

**按位置 `i` 配对**：

| i | 旧 cell | 新 cell | 结果 |
|---|---------|---------|------|
| 0 | 姓名 | 姓名 | ✅ 正常 |
| 1 | 年龄 | 部门 | ❌ 整格「大改」 |
| 2 | 部门 | （无） | ❌ 误标 delete |

用户看到的是：**右边列全错**，不是「删了一列」。

### 正确思路

在 **table** 级别先算列映射：`姓名↔0, 部门↔2, 年龄→删除`，再让每一行按映射合并——中间「年龄」整列红，「部门」仍和旧「部门」对齐 diff。

---

## 第 3 层：三层流程（数据流）

```
table（整张表）
  ├─ computeColumnMapping()           ← 只看第一行表头，算全局 ColumnMapping
  ├─ mergeSubsequence(行)             ← 行级加权 LCS：insert / delete / equal 行
  └─ equal 行 → mergeTableRowWithMapping()  ← 按列映射合并 cell
       └─ 每个 cell → mergeEqualNodes()     ← 格内段落 / 行内 word diff

tableRow（单独一行、无 table 父级上下文时）
  └─ for (i = 0; i < maxLen; i++) 按下标 i 配对
     （不跑列映射——列数是行内局部契约）
```

| 层级 | 策略 | 原因 |
|------|------|------|
| **table** | 表头列映射 + 行 LCS | 列增删是**整表事件**，所有行必须用同一映射 |
| **tableRow** | 按下标 `i` 配对 | 同一行内 LCS 自由配 cell 会超列数 / 截断 |
| **tableCell** | `mergeEqualNodes` | 格内再走段落、词级 diff |

**代码入口**：

```1090:1135:src/components/markdownDiff/markdownDiff.ts
if (oldNode.type === 'table' && newNode.type === 'table') {
  const columnMapping = computeColumnMapping(oldChildren, newChildren, config)
  const childDiff = mergeSubsequence(...)
  // equal 行 → mergeTableRowWithMapping(oRow, nRow, columnMapping, ...)
}
```

```1031:1047:src/components/markdownDiff/markdownDiff.ts
if (oldNode.type === 'tableRow' && newNode.type === 'tableRow') {
  for (let i = 0; i < maxLen; i++) {
    // 第 i 列始终对应第 i 列
    mergeEqualNodes(oldChildren[i], newChildren[i], ...)
  }
}
```

---

## 第 4 层：`computeColumnMapping`——表头怎么对上

### 数据结构

```1264:1269:src/components/markdownDiff/markdownDiff.ts
type ColumnMapping = {
  /** newToOld[newIdx] = oldIdx，-1 表示新列无匹配（新增列） */
  newToOld: number[]
  /** oldToNew[oldIdx] = newIdx，-1 表示旧列无匹配（删除列） */
  oldToNew: number[]
}
```

### 算法步骤（贪心，从左到右）

1. `getHeaderTexts(rows)`：取 **rows[0]** 每个 tableCell 的 `extractTextFromNode().trim()`。
2. 对每个新列 `ni`（0 → n-1）：
   - 在**未占用**的旧列 `oi` 中找：
     - 文本**完全相等** → 立即配对，`break`；
     - 否则 `computeTextSimilarity` ≥ `headerSimilarityThreshold`（默认 **0.85**）且为当前最高分 → 配对（列重命名）。
   - `usedOldCols.add(matchedOldIdx)`，写入 `newToOld[ni]`、`oldToNew[matchedOldIdx]`。
3. 未配上的新列 → `newToOld[ni] = -1`（新增列）；未配上的旧列 → `oldToNew[oi] = -1`（删除列）。

### 配置项

```67:74:src/components/markdownDiff/types.ts
export type DiffConfig = {
  /** 表头 fuzzy 匹配阈值（0~1），默认 0.85 */
  headerSimilarityThreshold?: number
  // ...
}
```

### 手算例子 A：删除中间列

```
旧表头: [姓名, 年龄, 部门]
新表头: [姓名, 部门]
```

| newIdx | 新表头 | 匹配旧列 | newToOld |
|--------|--------|----------|----------|
| 0 | 姓名 | 旧0 | 0 |
| 1 | 部门 | 旧2 | 2 |

`oldToNew`: `[0, -1, 1]` → 旧列1「年龄」= **删除列**。

---

## 第 5 层：`mergeTableRowWithMapping`——一行里怎么摆 cell

双指针 `oi`（旧列）、`ni`（新列），按映射**交错**输出，合并后列顺序 = **新表视觉顺序**（匹配列 + 删除列 + 新增列）。

### 主循环三种分支

```1359:1411:src/components/markdownDiff/markdownDiff.ts
while (oi < oldCells.length || ni < newCells.length) {
  if (newToOld[ni] === oi) {
    // 匹配列 → mergeEqualNodes(oldCells[oi], newCells[ni])
    oi++; ni++
  } else if (oldToNew[oi] === -1) {
    // 删除列 → annotate delete（红）
    oi++
  } else if (newToOld[ni] === -1) {
    // 新增列 → annotate insert（绿）
    ni++
  } else {
    break  // 非单调 → 回退
  }
}
```

### 手算例子 A 续：数据行合并

```
旧行: [张三, 25, 研发]
新行: [张三, 研发]
映射: newToOld = [0, 2], oldToNew[1] = -1

rowChildren 输出顺序:
  ① oi=0, ni=0  姓名格 mergeEqualNodes(张三, 张三)
  ② oi=1        年龄格 delete（整格红）
  ③ oi=2, ni=1  部门格 mergeEqualNodes(研发, 研发)
```

### 非单调降级 + 位置回退

若列**对调**（新表把第 1 列和第 5 列互换），`newToOld` 可能为 `[4,1,2,3,0]`，主循环 `newToOld[ni] === oi` 频繁失败 → `break`。

**回退逻辑**（`1414-1462` 行）：剩余 cell 按 `oi`、`ni` **下标一对一** `mergeEqualNodes`，再处理尾部纯 delete / insert。

**副作用**：对调的两列显示为「整列内容大改」，没有「列移动」语义——面试时应主动承认这是已知局限。

### `computeMergedAlign`

与 `rowChildren` 列顺序一致：匹配列用 `newAlign[ni]`，删除列用 `oldAlign[oi]`，新增列用 `newAlign[ni]`；非单调时同样 break + 位置回退。

---

## 第 6 层：五大难点 + 四大优化

### 难点 1：表头即真理

GFM 约定第一行是表头。若第一行是说明文字、或表头极长/为空，`computeColumnMapping` 会按错误文本配对。

**缓解思路**：用 `align` 行、或检测表头异常后降级为纯位置配对。

### 难点 2：贪心非全局最优

多列同时重命名 + 部分调换时，从左到右贪心可能不是最优配对（匈牙利 O(n³) 可解，列数通常 &lt; 30 可接受）。

### 难点 3：fuzzy 阈值 0.85 的边界

「部门」↔「团队」字符相似度可能 &lt; 0.85 → 判成 delete + insert 两列，丢失「重命名」语义。

**改进**：用**列内容指纹**（除表头外所有 cell 文本拼接）做二次匹配。

### 难点 4：tableRow vs table 两套逻辑

只有走到 `table` 分支才列映射；若 AST 路径异常只 diff 到 `tableRow`，不会走映射。

### 难点 5：hunk 路径与列下标

`mergeTableRowWithMapping` 里 `newPath` 用 `rowChildren.length`（合并后列序），`oldPath` 用 `oi`（旧列下标）——接受/拒绝时两侧 path 语义不同，需依赖 `DiffHunk` 的 `path` / `oldPath` 双字段（见 `accept-reject-interview-answer.md`）。

### 优化方向（按 ROI）

| 优化 | 方案 | 收益 |
|------|------|------|
| 列指纹兜底 | 表头匹配失败时用数据列 SimHash / 全文相似度 | 减少错配 |
| 匈牙利匹配 | `useHungarianMatching` 配置，列数 ≥ 8 启用 | 多列重命名场景更准 |
| move 语义 | 检测列置换，自定义 hunk 类型 | 对调列不再显示整列改写 |
| 可配置阈值 | 已有 `headerSimilarityThreshold` | 业务按领域调 fuzzy |

---

## 第 7 层：面试官延伸追问（预案）

### Q1：为什么 tableRow 不按表头映射？

**答**：`tableRow` 单独出现时没有「整张表」上下文，拿不到全局 `columnMapping`；且在同一行内，列下标就是**列契约**——LCS 自由配 cell 会让一行里 cell 数超过列数、渲染截断。列映射必须在 **table** 算一次、**所有 equal 行共用**。

### Q2：行级 LCS 和列映射会不会冲突？

**答**：不冲突、分工不同。行 LCS 决定「哪一行是 insert/delete/equal」；列映射只作用于 **equal 行** 内部的 cell 对齐。新增整行 → 整行 insert hunk；equal 行内删列 → 列映射标红格。

### Q3：如果表头完全一样但数据列完全不同？

**答**：当前只看表头，会强行 `newToOld[ni]=oi` 同下标或贪心配对，数据 diff 会在 `mergeEqualNodes(cell, cell)` 里用相似度/词级 diff 展示——**列语义可能错，但单元格内容 diff 仍可见**。更严谨应加列内容指纹校验。

---

## 答题节奏建议（5–6 分钟）

| 阶段 | 时长 | 内容 |
|------|------|------|
| 1. 动机反例 | 45 秒 | 删中间列 + 按位置配错的表 |
| 2. 三层流程 | 60 秒 | table / tableRow / cell |
| 3. computeColumnMapping | 90 秒 | 贪心 + newToOld / oldToNew |
| 4. mergeTableRowWithMapping | 90 秒 | 双指针 + 手算删列 |
| 5. 非单调降级 | 45 秒 | 列对调 → break → 位置回退 |
| 6. 难点 + 优化 | 60 秒 | 主动提贪心 / fuzzy / 列指纹 |

---

## 一句话收尾

> **行用 LCS 对齐，列用表头映射对齐；映射整张表算一次、每一行共用；删列标红、增列标绿、匹配列再进格内 word diff；列对调时降级为按位置硬配——这是「局部不变量（行内下标）」与「全局不变量（列映射）」在两层 API 上的分工。**

---

## 与其他文档的关系

| 文档 | 关系 |
|------|------|
| `interview-questions.md` 题四 | 索引级考察点 |
| `weighted-lcs-interview-answer.md` | 行级 LCS 的详细展开 |
| `accept-reject-interview-answer.md` | 列级 hunk 的 path / oldPath 应用 |
