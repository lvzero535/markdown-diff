# MD-001. 带权最长公共子序列与序列对齐回溯

| 属性 | 值 |
|------|-----|
| 难度 | Medium |
| 标签 | `动态规划` `二维 DP` `回溯` `序列对齐` |
| 项目实现 | [`markdownDiff.ts`](../src/components/markdownDiff/markdownDiff.ts) — `buildDP`、`backtrackDiff`、`mergeSubsequence` |
| 参考代码 | [`weighted-maximum-common-subsequence.ts`](./weighted-maximum-common-subsequence.ts) |
| 测试 | `npm run test -- algorithm/weighted-maximum-common-subsequence.test.ts` |

---

## 题目描述

给定两个序列 `oldSeq` 和 `newSeq`，长度分别为 `m` 和 `n`。每个下标 `i` 对应一个元素（在本项目中为 Markdown 块；抽象题为整数或字符串）。

对每个位置对 `(i, j)`（`0 <= i < m`，`0 <= j < n`），预先给定：

- **`canMatch(i, j)`**：`oldSeq[i]` 与 `newSeq[j]` 是否允许配对；
- **`weight(i, j)`**：若允许配对，配对得分，范围 `[0, 1]`（越像越高）。

请完成两件事：

1. **建表**：计算从前缀 `oldSeq[0..i)` 与 `newSeq[0..j)` 能得到的最**大配对得分总和** `dp[i][j]`。
2. **回溯**：根据 `dp` 与 `weights`，从 `(m, n)` 倒推，输出对齐操作序列。每一步为以下之一：
   - **`MATCH`**：配对 `(i-1, j-1)`，计入得分 `weight(i-1, j-1)`；
   - **`DELETE`**：跳过 `oldSeq[i-1]`（旧序列独有）；
   - **`INSERT`**：跳过 `newSeq[j-1]`（新序列独有）。

**目标**：使 `MATCH` 步骤的权重之和最大；若有多种最优方案，回溯时按题目规定的优先级打破平局（见解法）。

> **与经典 LCS 的区别**  
> - 经典 [LeetCode 1143](https://leetcode.com/problems/longest-common-subsequence/)：`canMatch` 仅当字符相等，匹配固定 `+1`。  
> - 本题：匹配条件由外部函数给出，匹配收益为可变权重；且回溯时必须验证该配对是否被 DP 最优解采纳。

---

## 示例 1

**输入**

```text
oldSeq = ["A", "C"]
newSeq = ["A", "B", "C"]

canMatch / weight（仅列出为 true 的对）:
  (0,0) A-A  weight=1.0
  (0,1) A-B  weight=0.46
  (1,2) C-C  weight=1.0
```

**输出（操作序列）**

```text
[
  { op: "MATCH",  oldIndex: 0, newIndex: 0 },  // A ↔ A
  { op: "INSERT", newIndex: 1 },               // B 为新增
  { op: "MATCH",  oldIndex: 1, newIndex: 2 },  // C ↔ C
]
```

**解释**

- 若错误地将 `A` 与 `B` 配对（权重 0.46），则 `C` 无法与后面的 `C` 配对，总分更低。
- 最优为 `1.0 + 1.0 = 2.0`：先配 `A-A`，中间 `INSERT B`，再配 `C-C`。

---

## 示例 2

**输入**

```text
oldSeq = ["Hello", "World"]
newSeq = ["Hello", "Vue"]

canMatch:
  (0,0) weight=1.0
  (1,1) 文本差异大 → canMatch=false
```

**输出**

```text
[
  { op: "MATCH",  oldIndex: 0, newIndex: 0 },
  { op: "DELETE", oldIndex: 1 },
  { op: "INSERT", newIndex: 1 },
]
```

**解释**

第二块无法配对，只能视为删掉 `World` 并插入 `Vue`，而不是强行 `MATCH`。

---

## 示例 3（严格相等，退化为经典 LCS）

**输入**

```text
oldSeq = [1, 2, 3]
newSeq = [2, 3, 4]

canMatch(i,j) = (oldSeq[i] === newSeq[j])
weight(i,j) = 1
```

**输出**

```text
[
  { op: "DELETE", oldIndex: 0 },
  { op: "MATCH",  oldIndex: 1, newIndex: 0 },
  { op: "MATCH",  oldIndex: 2, newIndex: 1 },
  { op: "INSERT", newIndex: 2 },
]
```

**最大得分** `dp[3][3] = 2`（子序列 `[2,3]`）。

---

## 约束

- `0 <= m, n <= 500`（项目中对大文本另有截断，见 `MAX_SIMILARITY_TEXT_LENGTH`）
- `0 <= weight(i,j) <= 1`
- `canMatch(i,j) = false` 时 `weight(i,j)` 忽略
- 答案序列长度 `<= m + n`

---

## 思路总览

```text
mergeSubsequence
    │
    ├─► buildDP        填表：dp[i][j] = 前缀 (i,j) 的最大配对得分
    │
    └─► backtrackDiff  从 (m,n) 倒走，还原 MATCH / DELETE / INSERT
```

### 状态定义

- `dp[i][j]`：考虑 `oldSeq[0..i)` 与 `newSeq[0..j)` 时的最大配对得分。
- `weights[i][j]`：若在最优解中配对 `(i-1,j-1)`，该步得分（仅当 `canMatch` 为真时写入）。

### 转移方程

设 `w = weight(i-1, j-1)`，当 `canMatch(i-1, j-1)`：

```text
dp[i][j] = max(
  dp[i-1][j-1] + w,   // MATCH
  dp[i-1][j],         // DELETE（旧多一块）
  dp[i][j-1]          // INSERT（新多一块）
)
```

否则：

```text
dp[i][j] = max(dp[i-1][j], dp[i][j-1])
```

### 回溯规则（从 `(i,j) = (m,n)` 开始）

1. 若 `canMatch(i-1,j-1)` 且 `dp[i][j] ≈ dp[i-1][j-1] + weights[i][j]` → **MATCH**，`i--, j--`。
2. 否则若 `i > 0` 且 (`j == 0` 或 `dp[i-1][j] > dp[i][j-1]`) → **DELETE**，`i--`。
3. 否则 → **INSERT**，`j--`。

> 第 1 条是关键：不能仅凭 `canMatch` 就 MATCH，必须证明该配对出现在最优 DP 路径上。

### 复杂度

| 阶段 | 时间 | 空间 |
|------|------|------|
| buildDP | `O(m × n × C)` | `O(m × n)` |
| backtrackDiff | `O(m + n)` | `O(m + n)` 输出 |

`C` 为单次 `canMatch` / `weight` 的成本。在本项目中 `C` 含文本相似度计算；抽象题中可视为 `O(1)`。

---

## 最优化解法

### TypeScript（抽象版，与仓库实现同构）

见 [`weighted-maximum-common-subsequence.ts`](./weighted-maximum-common-subsequence.ts)。

核心接口：

```typescript
type MatchFn = (i: number, j: number) => boolean
type WeightFn = (i: number, j: number) => number

function buildDP(m, n, canMatch, weight): { dp, weights }
function backtrack(m, n, oldSeq, newSeq, dp, weights, canMatch): AlignOp[]
function weightedLCS(oldSeq, newSeq, canMatch, weight): AlignOp[]
```

### 与项目代码的映射

| 题解抽象 | 项目函数 |
|----------|----------|
| `canMatch(i,j)` | `canNodesMatch(old[i], new[j], threshold, langs)` 或 `old[i].key === new[j].key` |
| `weight(i,j)` | `computeMatchWeight(old[i], new[j], langs)` 或 `1` |
| `buildDP` | `buildDP` |
| `backtrack` | `backtrackDiff` |
| `MATCH/INSERT/DELETE` | `equal` / `insert` / `delete`（`__data.diffType`） |

---

## 测试用例

| # | old | new | 期望要点 |
|---|-----|-----|----------|
| 1 | `A,C` | `A,B,C` | `MATCH(A,A)` → `INSERT(B)` → `MATCH(C,C)`，得分 2 |
| 2 | `Hello,World` | `Hello,Vue` | 仅首块 MATCH，次块 DELETE+INSERT |
| 3 | `1,2,3` | `2,3,4` | 严格相等权重 1，得分 2，子序列 `[2,3]` |
| 4 | `[]` | `A` | 仅 `INSERT` |
| 5 | `A` | `[]` | 仅 `DELETE` |
| 6 | `A,B` | `A,B` | 全 MATCH，得分 2 |

可执行测试：`algorithm/weighted-maximum-common-subsequence.test.ts`。

---

## 相关 LeetCode 题目

| 题号 | 题目 | 关系 |
|------|------|------|
| [1143](https://leetcode.com/problems/longest-common-subsequence/) | 最长公共子序列 | **核心模板**：本题为其加权 + 外部 `canMatch` 泛化 |
| [1092](https://leetcode.com/problems/shortest-common-supersequence/) | 最短公共超序列 | **回溯模板**：从 `dp` 倒推构造对齐序列 |
| [72](https://leetcode.com/problems/edit-distance/) | 编辑距离 | 同为二维 DP；目标为最小代价，且含替换操作 |
| [583](https://leetcode.com/problems/delete-operation-for-two-strings/) | 使两串相同的最少删除 | 与 LCS 长度等价：`m + n - 2·LCS` |
| [712](https://leetcode.com/problems/minimum-ascii-delete-sum-for-two-strings/) | 最小 ASCII 删除和 | 带权删除；权重在删字符上，而非配对相似度 |
| [1035](https://leetcode.com/problems/uncrossed-lines/) | 不相交的线 | 等价于 LCS 的另一种建模 |

**力扣中国站（若需中文题面）**

- [1143. 最长公共子序列](https://leetcode.cn/problems/longest-common-subsequence/)
- [1092. 最短公共超序列](https://leetcode.cn/problems/shortest-common-supersequence/)
- [72. 编辑距离](https://leetcode.cn/problems/edit-distance/)

---

## 练习建议

1. 先独立完成 **1143**（只算长度），再写回溯打印 LCS 下标（1092 前半思路）。
2. 在 1143 代码上把 `+1` 改成 `+weight[i][j]`，并把 `s[i]==s[j]` 换成 `canMatch(i,j)`，即得到 `buildDP`。
3. 实现回溯时务必加上 `dp[i][j] === dp[i-1][j-1] + weights[i][j]` 判断，理解场景 07（段落误配）为何需要加权。

---

## 附录：示例 1 的 DP 表（得分）

行 = 旧前缀长度 `i`，列 = 新前缀长度 `j`（得分取两位小数示意）：

```text
        j=0   j=1   j=2   j=3
        ∅     A     B     C
i=0 ∅     0     0     0     0
i=1 A     0    1.0   1.0   1.0
i=2 C     0    1.0   1.0   2.0  ← 最优右下角
```

从 `(2,3)=2.0` 倒推：`(1,2)` 处 MATCH `C-C` → `(1,1)` INSERT `B` → `(0,0)` MATCH `A-A`。
