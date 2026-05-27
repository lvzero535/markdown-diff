# 面试答题稿：加权 LCS 是如何匹配的

> **使用场景**：面试官追问"你的加权 LCS 到底是怎么匹配的"时的标准答案模板。
>
> **核心心法**：永远不要只答到"算法层"，按 **「硬筛选 → 软打分 → DP 状态转移 → 回溯 epsilon 校验 → 业务案例」** 五层往下讲。
>
> - 能讲到第 4 层 = 高级工程师
> - 主动给出第 5 层业务案例 = 资深技术专家

---

## 标准答案：分五层逐步展开

### 第 1 层：一句话定义"加权"（15 秒）

> "加权 LCS 在等权 LCS 的基础上，**把 DP 状态从『匹配个数』改成『匹配总权重』**——权重 = 节点对的文本相似度（0~1）。这样 DP 找到的最优路径不再是『配对最多』，而是『配对**质量**最高』。"

讲完这句立刻进入第 2 层，**不要停顿**——停顿就给面试官追问的机会，应当一气呵成展示完整答题框架。

---

### 第 2 层：拆解为两个独立步骤（90 秒）

候选人最常见的混淆是把"匹配判定"和"权重计算"说成一件事。**要主动拆开**：

#### 步骤 A：**匹配判定**（`canNodesMatch`）—— 硬性筛选

```1724:1769:src/components/markdownDiff/markdownDiff.ts
function canNodesMatch(
  oldNode: MdastNode,
  newNode: MdastNode,
  threshold: number,
  autoMatchCodeLangs: Set<string>
): boolean {
  // 类型不同，不可匹配
  if (oldNode.type !== newNode.type) return false

  // 各节点类型的结构属性检查
  switch (oldNode.type) {
    case 'heading':
      if (oldNode.depth !== newNode.depth) return false
      break
    case 'code':
      if (String(oldNode.lang ?? '') !== String(newNode.lang ?? '')) return false
      // 1:1 code lang 直接匹配，跳过相似度检查
      if (autoMatchCodeLangs.has(String(oldNode.lang ?? ''))) return true
      break
    // ...
  }
  // ...
  const effectiveThreshold = TYPE_SIMILARITY_THRESHOLDS[oldNode.type] ?? threshold
  return (
    computeTextSimilarity(oldText, newText, { similarityThreshold: threshold }) >=
    effectiveThreshold
  )
}
```

**口述要点**：

- **三层短路**：类型不同 → 直接 false；结构属性（heading depth / code lang / link url 等）不同 → 直接 false；都过了再算文本相似度。
- **类型化阈值**：`heading=0.55 / code=0.5 / table=0.45` 等，从 `TYPE_SIMILARITY_THRESHOLDS` 取，找不到才回退到全局 `similarityThreshold=0.35`。这一步控制"什么样的相似度**才有资格**进入候选"。
- **特殊快通道**：唯一 lang 的 code 块（`autoMatchCodeLangs`）直接判 true，跳过相似度——这是基于"文档里只有一段 Rust 代码"这种结构信号的强匹配。

#### 步骤 B：**权重计算**（`computeMatchWeight`）—— 软性打分

```1782:1795:src/components/markdownDiff/markdownDiff.ts
function computeMatchWeight(
  oldNode: MdastNode,
  newNode: MdastNode,
  autoMatchCodeLangs: Set<string>
): number {
  // 自动匹配的代码块（唯一 lang），给予最高权重
  if (oldNode.type === 'code' && autoMatchCodeLangs.has(String(oldNode.lang ?? ''))) {
    return 1.0
  }
  const oldText = extractTextFromNode(oldNode)
  const newText = extractTextFromNode(newNode)
  if (oldText.length === 0 && newText.length === 0) return 1.0
  return computeTextSimilarity(oldText, newText)
}
```

**口述要点**：

- 通过 `canNodesMatch` 的节点对**再**算一次相似度作为权重（这次不带阈值参数，是连续的 0~1 实数）。
- 唯一 lang 代码块给 1.0 满分，体现"强结构信号 > 文本相似度"。
- 空文本节点（如 `thematicBreak`）给 1.0，避免被零权重忽略。

**关键 trick**：判定和权重用的都是 `computeTextSimilarity`（基于 `textLCSLength`，O(n·m) 字符 DP，截断到 2000 字符），但**消费方式不同**——判定是"过阈值就 true"，权重是"实数本身"。这样同一个相似度结果在两个阶段被消费两次（其实代码里算了两次，可以在内层缓存优化，是个潜在 perf 点）。

---

### 第 3 层：写出 DP 状态转移方程（90 秒）

候选人能不能写出转移方程是真懂和假懂的分水岭。**主动在白板上写**：

**等权 LCS 转移方程**：

```
dp[i][j] = oldAst[i-1].key == newAst[j-1].key
  ? dp[i-1][j-1] + 1
  : max(dp[i-1][j], dp[i][j-1])
```

**加权 LCS 转移方程**（本项目）：

```
weight = canNodesMatch(old[i-1], new[j-1]) ? computeMatchWeight(old[i-1], new[j-1]) : 0
dp[i][j] = max(
  dp[i-1][j-1] + weight,   // 取对角线（吃掉这次匹配的权重）
  dp[i-1][j],              // 跳过 old[i-1]（delete）
  dp[i][j-1]               // 跳过 new[j-1]（insert）
)
weights[i][j] = weight     // 单独存权重，回溯时校验用
```

```1832:1870:src/components/markdownDiff/markdownDiff.ts
function buildDP<T extends { key: string }>(
  oldAst: T[],
  newAst: T[],
  config?: DiffConfig,
  autoMatchCodeLangs?: Set<string>
): { dp: number[][]; weights: number[][] } {
  const m = oldAst.length
  const n = newAst.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  const weights: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  // ...
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const matched = config
        ? canNodesMatch(...)
        : oldAst[i - 1].key === newAst[j - 1].key
      if (matched) {
        const weight = config
          ? computeMatchWeight(...)
          : 1
        weights[i][j] = weight
        dp[i][j] = Math.max(dp[i - 1][j - 1] + weight, dp[i - 1][j], dp[i][j - 1])
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  return { dp, weights }
}
```

**两个细节必须提到**：

1. **维护 `weights` 矩阵单独存**：等权 LCS 不需要这个，因为权重恒为 1，回溯时"上次匹配贡献了 1"是隐含的。加权 LCS 里权重 ∈ [0,1] 连续，回溯时**必须知道每格当时记下来的权重**才能判断 dp 是从哪条边来的。
2. **DP 值的语义**：等权 LCS 里 `dp[i][j]` 是整数（匹配个数）；加权 LCS 里 `dp[i][j]` 是浮点数（权重总和），所以下面回溯比较要用 epsilon。

---

### 第 4 层：回溯——加权 LCS 的「最危险」环节（90 秒）

这是面试官最容易往深里挖的地方。**要主动讲，不能等问**。

```1899:1932:src/components/markdownDiff/markdownDiff.ts
while (i > 0 || j > 0) {
  const canMatch = i > 0 && j > 0 && (config ? canNodesMatch(...) : ...)

  // 仅当 DP 实际选择了该匹配时才走对角线
  if (canMatch && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + weights[i][j])) < EPS) {
    result.unshift({ ..., __data: { diffType: 'equal', ... } })
    i--; j--
    continue
  }
  if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1] + EPS)) {
    result.unshift({ ..., __data: { diffType: 'delete' } })
    i--
    continue
  }
  if (j > 0) {
    result.unshift({ ..., __data: { diffType: 'insert' } })
    j--
  }
}
```

**口述 3 个关键点**：

1. **为什么不能只看 `canMatch` 就走对角线**：
   - 等权 LCS 时，只要 `canMatch=true`，对角线一定优于或等于横竖（`dp[i-1][j-1]+1 ≥ max(dp[i-1][j], dp[i][j-1])`），所以"看 canMatch 就走对角线"是安全的。
   - 但**加权 LCS 不成立**——比如 `dp[i-1][j-1]=2.0, weight=0.4, dp[i-1][j]=2.5`，那 `dp[i][j] = max(2.4, 2.5) = 2.5`，是从横边来的。如果回溯时只看 `canMatch` 就吃对角线，会拿到"差 0.1 权重"的次优路径，等于让弱匹配抢占了强匹配的位置——**这正是加权 LCS 要避免的问题**，结果反而被回溯环节亲手破坏。

2. **`Math.abs(dp[i][j] - (dp[i-1][j-1] + weights[i][j])) < EPS`**：
   - 这是浮点等值比较的标准做法（`EPS = 1e-9`），等价于"DP 当时确实选了对角线分支"。
   - 三种来源（对角线 / 上 / 左）都可能等值，需要按优先级（对角 > 上 > 左）走，逻辑上等价"DP 选哪条算哪条"。

3. **delete vs insert 的判定也要带 EPS**：
   - `dp[i-1][j] > dp[i][j-1] + EPS` 而不是 `>`——避免两侧权重浮点相等时不稳定（一会儿走 delete 一会儿走 insert），结果不稳定会影响 hunk ID 稳定性。

---

### 第 5 层：抛出对比案例「证明」加权的价值（60 秒）

讲完算法立刻给个具体 case，否则面试官会觉得"听起来高级但不知道有啥用"。

**Case**：旧文档有两段 H2：

```
H2: 项目背景
H2: 项目目标
```

新文档只剩：

```
H2: 项目背景描述
```

**等权 LCS 的行为**：

- `canNodesMatch(项目背景, 项目背景描述)` → 文本相似度高（4 字共有 / 6 字最长 ≈ 0.67），过阈值 → true
- `canNodesMatch(项目目标, 项目背景描述)` → 共有"项目"两字 / 6 字 ≈ 0.33，过 paragraph 阈值 0.35 → 也可能 true（取决于具体字数）
- 等权 LCS：两边都能匹配时**选哪个对 LCS 长度没影响**（都是 +1），可能按下标顺序选了"项目目标"配"项目背景描述"
- **结果**：「项目背景」delete，「项目目标 → 项目背景描述」modified —— **违反人类直觉**

**加权 LCS 的行为**：

- `weight(项目背景, 项目背景描述) ≈ 0.67`
- `weight(项目目标, 项目背景描述) ≈ 0.33`
- DP 显然会选「项目背景 → 项目背景描述」这条权重 0.67 的路径，把「项目目标」走 delete
- **结果**：「项目目标」delete，「项目背景 → 项目背景描述」modified —— **符合人类直觉**

---

## 答题节奏建议

整段回答**控制在 4-6 分钟**，按这个节奏：

| 阶段 | 时长 | 内容 | 目的 |
|---|---|---|---|
| 1. 一句话定义 | 15 秒 | "把 DP 状态从匹配个数改成总权重" | 立刻给面试官"懂行"的信号 |
| 2. 拆判定 / 权重两步 | 90 秒 | 指着 `canNodesMatch` + `computeMatchWeight` 讲 | 证明熟悉代码，不是 README 抄的 |
| 3. 白板写转移方程 | 90 秒 | 对比等权 vs 加权 | 测算法功底 |
| 4. 讲回溯的 EPS 校验 | 90 秒 | 解释为什么不能只看 canMatch | 这是加权 LCS 最容易出错的环节，讲得出说明真的 debug 过 |
| 5. 案例「项目背景 / 目标」 | 60 秒 | 数字推演一遍 | 落地到业务，证明这是"有用的复杂" |

---

## 面试官最爱追问的延伸题（提前准备答案）

### 追问 1：权重为什么取相似度而不取 `1 - 编辑距离`？

**答**：相似度 ∈ [0,1] 是归一化的，可以直接跨节点对比累加；编辑距离是绝对值（依赖文本长度），10 字短文本和 1000 字段落的 `dist=5` 含义完全不同，加进 DP 会让长文本节点的权重失真。

### 追问 2：权重的下界为什么不是 `canNodesMatch` 的阈值（0.35），而是 0？

**答**：`canNodesMatch` 已经过滤了不达阈值的对——能进入 `computeMatchWeight` 的相似度一定 ≥ 阈值。权重数值上的最小值是阈值（不是 0）；之所以代码里 `weights[i][j]` 默认初始化为 0，是给"该格根本没匹配"的情况留位，方便回溯统一处理。

### 追问 3：O(m·n) 加上每格内部还要算文本相似度的字符 DP（O(2000²)），总复杂度是不是 O(m·n·L²)？

**答**：是的，最坏 O(m·n·L²)。本项目用三个手段控制：

1. `MAX_SIMILARITY_TEXT_LENGTH = 2000` 截断 L；
2. `canNodesMatch` 内部对类型 / 结构不同的对**直接 short-circuit return**，省掉字符 DP；
3. 唯一 lang 代码块跳过相似度直接给 1.0。

**潜在优化**：把 `canNodesMatch` 里算过的相似度缓存到 `weights[i][j]`，避免 `computeMatchWeight` 重算同一对节点的相似度——目前是算了两次，是个能讲出来的 perf 改进点。

---

## 一句话总结

> **核心心法**：面试官问"是怎么匹配的"时，永远不要只答到"算法层"——要按 **「硬筛选（canNodesMatch）→ 软打分（computeMatchWeight）→ DP 状态转移 → 回溯 epsilon 校验 → 业务案例」** 五层往下讲。
>
> 能讲到第 4 层的就是高级工程师，能主动给出第 5 层业务案例的就是资深技术专家。

---

## 附录 A：DP 方程的几何直觉（给不熟悉动态规划的读者）

> 第 3 层的转移方程对 DP 基础不扎实的读者可能"看着懂、讲不出"。
> 本附录用 **「网格 + 三个箭头 + 手算例子」** 的方式从零讲清楚那三行 `max` 的意义。
> **建议在面试中作为白板辅助讲解**——能现场画出来的候选人，可信度立刻拉满。

### A.1 先理解 `dp[i][j]` 是什么

`dp` 是一个二维数组（一个网格），尺寸是 `(m+1) × (n+1)`，其中：

- `m = oldAst.length`（旧文档块数）
- `n = newAst.length`（新文档块数）

**`dp[i][j]` 的含义**：

> "**用旧文档的前 `i` 个块**和**新文档的前 `j` 个块**做匹配，能得到的**最大总权重**是多少。"

举个具体例子——假设：

```
oldAst = [背景, 目标]            // m = 2
newAst = [背景描述]              // n = 1
```

我们要建一张 3 行 2 列的网格（多一行一列哨兵 0）：

```
              j=0     j=1
              ""     背景描述
       ┌─────────────────────┐
i=0 "" │  0  │  0  │           ← 第 0 行：旧文档"空"，权重当然 0
       ├─────┼─────┤
i=1 背景│  0  │ ?   │           ← dp[1][1] = 用 [背景] 和 [背景描述] 匹配的最大权重
       ├─────┼─────┤
i=2 目标│  0  │ ?   │           ← dp[2][1] = 用 [背景, 目标] 和 [背景描述] 匹配的最大权重
       └─────┴─────┘
```

**最终我们要的答案就是 `dp[m][n]` —— 最右下角那一格**。它代表"用完整的两个序列做匹配的最大总权重"。

### A.2 `i` 和 `j` 是怎么"走"的

把 `dp[i][j]` 想象成一个走格子的游戏：

- **你站在 `dp[i][j]`**，要决定"从哪里跳过来"。
- 只有三个方向可以跳：从**左上**（`dp[i-1][j-1]`）、从**上面**（`dp[i-1][j]`）、从**左边**（`dp[i][j-1]`）。

```
   dp[i-1][j-1] ────► dp[i-1][j]
        │   ＼            │
        │     ＼          │
        ▼      ＼         ▼
   dp[i][j-1] ────► dp[i][j]   ← 你在这
```

**三个方向 = 三种"决策"**，对应 LCS 中的三种处理方式：

| 来自 | 决策 | 含义 |
|---|---|---|
| **左上** `dp[i-1][j-1]` | **配对** `old[i-1] ↔ new[j-1]` | 旧文档第 i 个 和 新文档第 j 个 **匹配** |
| **上面** `dp[i-1][j]` | **跳过 `old[i-1]`** | 旧文档第 i 个**没有对应**，标 **delete** |
| **左边** `dp[i][j-1]` | **跳过 `new[j-1]`** | 新文档第 j 个**没有对应**，标 **insert** |

### A.3 三个 max 候选值的物理意义

回到那三行代码：

```
dp[i][j] = max(
  dp[i-1][j-1] + weight,   // 候选①：从左上跳来，并吃掉这次匹配的权重
  dp[i-1][j],              // 候选②：从上面跳来（不吃任何权重）
  dp[i][j-1]               // 候选③：从左边跳来（不吃任何权重）
)
```

**逐行解读**：

#### 候选 ①：`dp[i-1][j-1] + weight`

> "**如果我决定让 old[i-1] 和 new[j-1] 配对**——那么我之前能拿到的最大权重就是 `dp[i-1][j-1]`（前 i-1 个旧块 + 前 j-1 个新块的最大权重），**再加上这次配对的相似度权重**。"

- `dp[i-1][j-1]` = 之前积累的权重
- `+ weight` = 这次新配对带来的"加分"
- **前提**：`canNodesMatch(old[i-1], new[j-1]) === true`，否则 weight = 0，对角线就退化了

#### 候选 ②：`dp[i-1][j]`

> "**如果我决定放弃 `old[i-1]`（标成 delete）**——那么我现在的权重就和"少考虑这个旧块"时一样，即 `dp[i-1][j]`。"

- 注意这里**没有 +1 也没有 +weight**——delete 不贡献"匹配数"，所以权重不增加。

#### 候选 ③：`dp[i][j-1]`

> "**如果我决定放弃 `new[j-1]`（标成 insert）**——那么我现在的权重就和"少考虑这个新块"时一样，即 `dp[i][j-1]`。"

- 同样，insert 不贡献匹配数，权重不变。

**取 `max`** = "我有三种决策可选，**贪心地选权重最大的那一种**"——这就是动态规划的核心思想。

### A.4 手算一遍那个例子（最关键）

继续用：

```
oldAst = [背景, 目标]
newAst = [背景描述]
```

**权重表**（提前算好相似度）：

| | vs 背景描述 |
|---|---|
| 背景 | 0.67（相似度高） |
| 目标 | 0.33（相似度低，但过了阈值） |

#### 填充 `dp[1][1]`（i=1, j=1，对应"背景 vs 背景描述"）

三个候选：

- ① `dp[0][0] + weight = 0 + 0.67 = 0.67`（配对："背景 ↔ 背景描述"）
- ② `dp[0][1] = 0`（跳过"背景"）
- ③ `dp[1][0] = 0`（跳过"背景描述"）

`max(0.67, 0, 0) = 0.67` → **`dp[1][1] = 0.67`**

同时记 `weights[1][1] = 0.67`（备份这次匹配的权重，回溯时用）。

```
              j=0     j=1
              ""     背景描述
       ┌─────────────────────┐
i=0 "" │  0  │  0  │
       ├─────┼─────┤
i=1 背景│  0  │ 0.67│       ← 刚算出
       ├─────┼─────┤
i=2 目标│  0  │ ?   │
       └─────┴─────┘
```

#### 填充 `dp[2][1]`（i=2, j=1，对应"目标 vs 背景描述"）

三个候选：

- ① `dp[1][0] + weight = 0 + 0.33 = 0.33`（配对："目标 ↔ 背景描述"，权重 0.33）
- ② `dp[1][1] = 0.67`（跳过"目标"，让前面"背景 ↔ 背景描述"的匹配继续生效）
- ③ `dp[2][0] = 0`（跳过"背景描述"）

`max(0.33, 0.67, 0) = 0.67` → **`dp[2][1] = 0.67`**

**关键点**：DP 在这里选择了"**走候选 ②**"——即"宁可不配对 '目标 ↔ 背景描述'，也要保留前面 '背景 ↔ 背景描述' 的高权重匹配"。

注意：

- `weights[2][1] = 0.33`（仍然记录这次"假设要配对"的权重，但 DP 实际没选这条路）
- 这个数字会在**回溯**时帮我们判断 DP 走的是哪条路（这就是为什么要单独维护 `weights` 矩阵的原因）

```
              j=0     j=1
              ""     背景描述
       ┌─────────────────────┐
i=0 "" │  0  │  0  │
       ├─────┼─────┤
i=1 背景│  0  │ 0.67│
       ├─────┼─────┤
i=2 目标│  0  │ 0.67│       ← 注意没走对角线，从上面继承了 0.67
       └─────┴─────┘
```

#### 最终答案：`dp[2][1] = 0.67`

意思是：把"背景 ↔ 背景描述"配上对（权重 0.67），"目标"标 delete，总权重 0.67——这就是最优解。

### A.5 关键对比：等权 LCS 在同样的例子上会怎么走？

把转移方程换成**等权**版本（不再有 weight，匹配时 +1）：

```
dp[i][j] = old[i-1].key == new[j-1].key
  ? dp[i-1][j-1] + 1
  : max(dp[i-1][j], dp[i][j-1])
```

但 LCS 在做"块级匹配"时，`canNodesMatch` 已经把"背景 vs 背景描述"和"目标 vs 背景描述"**都判成 true**（都过了 0.35 阈值）。所以填表：

#### 等权 `dp[1][1]`

- canMatch=true → `dp[0][0] + 1 = 1`
- → `dp[1][1] = 1`

#### 等权 `dp[2][1]`

- canMatch=true（目标 vs 背景描述）→
  - ① `dp[1][0] + 1 = 1`（配对"目标 ↔ 背景描述"）
  - ② `dp[1][1] = 1`（跳过"目标"）
  - ③ `dp[2][0] = 0`
- `max(1, 1, 0) = 1` → **平局！**

**平局怎么办？** 这就是问题所在——回溯时如果默认"优先走对角线"，DP 会把"目标"配给"背景描述"，结果：

- ❌ **等权 LCS 结果**：「背景」delete，「目标 → 背景描述」modified —— **错配**
- ✅ **加权 LCS 结果**：「目标」delete，「背景 → 背景描述」modified —— **正确**

加权的核心价值就在这里：**用权重数值打破平局，让"质量更高"的那条匹配胜出**。

### A.6 为什么这三个候选值"恰好"覆盖所有可能？

这是 LCS 设计上很优雅的一点——**任何一种"前 i 个 vs 前 j 个"的匹配方案，最后一步必然属于这三种之一**：

1. **第 i 个旧块和第 j 个新块配对了** → 转化成"前 i-1 个 vs 前 j-1 个 + 这次匹配"的子问题（候选 ①）
2. **第 i 个旧块没人对应（被 delete）** → 转化成"前 i-1 个 vs 前 j 个"的子问题（候选 ②）
3. **第 j 个新块没人对应（被 insert）** → 转化成"前 i 个 vs 前 j-1 个"的子问题（候选 ③）

这种"枚举最后一步"是 DP 的经典套路——只要枚举完整，就能保证 `max` 出来的就是全局最优解。

### A.7 三个视角的总结

| 视角 | 解读 |
|---|---|
| **代数视角** | `dp[i][j]` = 三个子问题的最优解 + 本次决策的代价，取 max |
| **几何视角** | 在 m×n 的网格上找一条从 (0,0) 到 (m,n) 的路径，路径只能"右、下、右下"三种走法，"右下"走一步可获得 `weight` 权重 |
| **业务视角** | "保留质量高的匹配（高 weight），让质量低的对一边'让位'变成 insert/delete" |

加权 LCS 的全部魔法就在那一行 `dp[i-1][j-1] + weight`——把"匹配个数"换成"匹配权重"，整个 DP 的最优路径就从"匹配最多"变成"匹配最优"。
