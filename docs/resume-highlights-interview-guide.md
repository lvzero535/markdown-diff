# 简历亮点 · 面试展开话术（3 条简版）

> 对应简历上的 3 条 MarkdownDiff 亮点。每条按 **「痛点 → 方案 → 例子 → 局限/演进」** 组织，单条控制在 **1～2 分钟**；被追问再指 `docs/*-interview-answer.md` 深讲。

**项目一句话**：Vue 3 Markdown 修订对比（类 Google Docs），AST 块级对齐 + 行内 diff，支持单块接受/拒绝并写回 Markdown。

---

## 亮点 1：混合 diff 架构

**简历原文**：`remark` 解析 mdast 做块级对齐与表格/列表结构保留，块内词/字符级高亮；自研加权匹配降低段落/标题错配，表头列映射正确处理增删列。

### 30 秒版（必背）

> 纯文本行 diff 会把表格、列表打碎；纯 DOM diff 又写不回 Markdown。我们用 **remark 解析成 mdast**，先在**块级**对齐段落/标题/表格行，再在**已配对的块内**做词级或字符级高亮。块对齐不是简单 LCS，而是**按相似度加权**，避免两个都像的标题配错；表格另外用**表头算列映射**，删中间列不会让右边整格标错。

### 展开结构（1～2 分钟）

| 步骤         | 说什么                                                      |
| ------------ | ----------------------------------------------------------- |
| **痛点**     | 行 diff 对 Markdown 语义不对；DOM diff 没有 Markdown 源。   |
| **分层**     | 块级定结构 → 块内定字；表格/列表/代码块有专门规则。         |
| **加权对齐** | 能配对的块还要「够像」；标题/代码阈值更严，避免弱匹配抢位。 |
| **表格**     | 行 LCS + 表头列映射（见亮点 1 子话题下表）。                |
| **局限**     | 大文档全量算有性能边界；已做文本截断、代码 lang 1:1 等。    |

### 子话题 A：为什么 AST + 文本，不用 jsondiffpatch / 纯 Myers？

**答**：

- Markdown 的单元是**块**不是行；Myers 适合行文本，对「相似段落」没有权重概念。
- jsondiffpatch 对深层 JSON 数组 delta 难控，合并结果不符合「人类直觉的块修改」。
- 我们在 mdast 上自研**加权对齐 + 递归 merge**，再只在叶子文本上用 `diff` 包。

**别展开**：DP 转移方程（除非对方是算法岗）。

### 子话题 B：加权匹配解决什么问题？

**答**（举一例即可）：

> 旧文档有「项目背景」「项目目标」，新文档只剩「项目背景描述」。朴素 LCS 可能把「目标」配给「背景描述」，背景反而被 delete。加权后优先配相似度高的「背景↔背景描述」，「目标」走 delete——符合审阅直觉。

**深讲文档**：`weighted-lcs-interview-answer.md`

### 子话题 C：表头列映射（删中间列）

**30 秒版**：

> 行用 LCS；列用第一行表头算全局映射，每行共用。删「年龄」时中间整列标红删除，「部门」仍和旧「部门」对齐 diff，不会和右边列错位。

**1 分钟版**：按「痛点 → 行/列两层 → 删列例子 → fuzzy 重命名(0.85) → 列对调会降级」展开。

**深讲文档**：`table-column-mapping-interview-answer.md`

### 子话题 D：代码块 / 段落有什么特殊处理？

**答**（各一句）：

- **代码块**：字符级 diff；换行边界归一化，避免高亮挂到下一行。
- **段落**：inline 结构剧变（如 `**粗体**` 变纯文本）时退化为整段文本 diff，避免 inline 子节点 LCS 乱配。
- **列表/表格行**：块级 insert/delete 可整项接受拒绝。

### 可能被追问 · 一句话收尾

> 核心是 **「结构用 AST，改动用文本，对齐用加权」**，表格再叠一层列契约。

---

## 亮点 2：可交互修订流

**简历原文**：hunk 双侧路径 + 可配置接受/拒绝策略，mdast 往返写回；rehype 消毒 + 自定义白名单，安全输出 `v-html`。

### 30 秒版（必背）

> 每个变更块是一个 **hunk**，带在新/旧 AST 里的**路径**和节点快照。点接受默认把旧稿改成新版本，点拒绝把新稿回退；也可配置同时改两侧。改的是 **mdast 再序列化回 Markdown**，不是改 HTML。渲染走 **sanitize 白名单**，再注入 diff 样式和按钮，才能安全 `v-html`。

### 展开结构（1～2 分钟）

| 步骤              | 说什么                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| **hunk 是什么**   | id + diffType(insert/delete/modified) + path/oldPath + oldNode/newNode。 |
| **双侧路径**      | 插入只占新侧下标、删除只占旧侧下标，两边 path 不同是常态。               |
| **接受/拒绝语义** | accept=采纳新内容；reject=保留旧内容；classic / syncBoth 等预设。        |
| **数据流**        | 点击 → apply 到 AST → emit Markdown → 父组件更新 → 全量重算 diff 视图。  |
| **安全**          | raw 解析 HTML 后必须 sanitize；diff 的 class、按钮属性单独放行。         |

### 子话题 A：接受 / 拒绝在 AST 上具体做什么？

**答**（记口诀，不讲 12 格真值表）：

- **insert + accept**：旧侧在 oldPath 插入 newNode。
- **insert + reject**：新侧在 path 删掉。
- **delete + accept**：旧侧删掉。
- **delete + reject**：新侧插回 oldNode。
- **modified**：accept 用 newNode 替换，reject 用 oldNode。

**深讲文档**：`accept-reject-interview-answer.md`

### 子话题 B：为什么用 path，不用 DOM？

**答**：

- 源 of truth 是 **Markdown / mdast**；DOM 是渲染结果，无法干净 round-trip。
- path 是「从 root 到节点的下标数组」，apply 时 splice 或替换 parentChildren[index]。

### 子话题 C：为什么 sanitize 在 raw 之后？

**答**：

> 用户 Markdown 里可能有 `<script>`。必须先 `rehype-raw` 把字符串变成节点树，**再** `rehype-sanitize` 按白名单剥属性；顺序反了 HTML 仍是字符串，消毒无效。工具栏在 sanitize **之后**由我们代码生成，属于信任边界内。

### 子话题 D：mdast 写回会不会改坏用户原文？

**答**（诚实）：

> `mdastToMarkdown` 会规范化列表符、格式等，accept 一个 hunk 可能 emit 出与原文风格略有差异的全文——已知局限，后续可做 position 局部 patch 或可配置 toMarkdown。

### 主动加分：已知风险

> 连续快速点多个 accept，若依赖父组件 props 回流再算，可能竞态丢修改——应用内部维护 AST 副本或批量 API + path 倒序。这是架构上准备演进的点。

### 可能被追问 · 一句话收尾

> hunk 是 **双侧坐标的快照 + 可配置写回**；安全靠 **sanitize 顺序 + 窄白名单**，不是「没人报 XSS 就等于安全」。

---

## 亮点 3：工程化落地

**简历原文**：`useMarkdownDiff` composable、防抖渲染与事件委托；面向大文档预留 Worker / 增量更新等演进路径。

### 30 秒版（必背）

> 逻辑放在 **useMarkdownDiff**：解析、合并、hunks、resolveAction；组件只负责 **v-html 展示和点击**。HTML 用 **shallowRef + 约 120ms 防抖**，避免每次按键全量 stringify。按钮在动态 HTML 里用 **容器事件委托**，不逐个绑监听。大文档目前会全量重算，已做相似度截断等边界，后续计划 **Worker 算 diff、增量 patch、虚拟滚动**。

### 展开结构（1～2 分钟）

| 步骤         | 说什么                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| **分层**     | composable（状态+算法调用）/ Vue 组件（展示+交互）/ hunkPath（apply）。 |
| **响应式**   | 大 HTML 浅响应式；AST 不宜深层 reactive（可提 markRaw）。               |
| **防抖**     | 合并重渲染；计算侧还可再 debounce。                                     |
| **事件委托** | v-html 无模板绑定；closest 找 data-diff-id / data-action。              |
| **共享状态** | provide/inject 多面板共用一份 diff，避免双份 LCS。                      |
| **演进**     | 全量重算是当前取舍；Worker / 增量 / 虚拟化是分阶段路线。                |

### 子话题 A：为什么 composable，不全写组件里？

**答**：

- 双栏对比、变更列表、主视图可 **共用** `html / hunks / resolveAction`。
- 单元测试可直接测 `buildMergedMdast`、`resolveHunk` 而不挂载 DOM。
- 组件变薄，只处理 a11y（聚焦、A/R 快捷键）。

### 子话题 B：事件委托「优化」到底是什么？

**答**（若被质疑措辞，诚实说法）：

> v-html 里的按钮不能 `@click`。若不委托，就要每次渲染后对每个按钮 `addEventListener`，DOM 重建易泄漏。委托是 **一个 listener + closest**，配合 v-html 整块替换更稳。不是替代 Vue 模板绑定，而是动态 HTML 的唯一合理交互方式。

### 子话题 C：大文档现在卡在哪、怎么演进？

**答**（按阶段，体现规划）：

| 现状瓶颈                              | 方向                          |
| ------------------------------------- | ----------------------------- |
| 块级 LCS + 全量 parse/render 在主线程 | Web Worker 跑 diff            |
| 每次 accept 全量 v-html               | 子树增量 render               |
| 超长文 DOM 一次挂载                   | 按块虚拟滚动                  |
| 每次 resolve 全量 rebuild             | 批量 API、内部 AST 副本消竞态 |

**深讲文档**：`implementation-strategy.md` 第六节「后续演进」

### 子话题 D：测试怎么保证质量？

**答**：

- `markdownDiff.test.ts` 覆盖对齐、hunk、表格等；
- mock 场景文档记录历史边界 bug（`scenario-fix-summary.md`）。

### 可能被追问 · 一句话收尾

> 工程上是 **composable 复用 + 渲染防抖 + 动态 DOM 委托**；性能上承认 **全量重算**，演进路径清晰而不是没想清楚。

---

## 三条亮点对照表（速查）

| #   | 简历关键词                   | 30 秒核心                            | 深讲文档                                |
| --- | ---------------------------- | ------------------------------------ | --------------------------------------- |
| 1   | AST、加权、表头列映射        | 块级结构 + 加权对齐 + 表头列映射     | `weighted-lcs` / `table-column-mapping` |
| 2   | hunk、接受拒绝、sanitize     | 双侧 path + 写回 Markdown + 消毒顺序 | `accept-reject-interview-answer`        |
| 3   | composable、防抖、委托、演进 | 分层 + 防抖委托 + Worker/增量规划    | `implementation-strategy`               |

---

## 通用技巧

1. **先业务后技术**：先说用户看到什么（红绿、接受拒绝、表格删列不错位），再说 mdast/LCS。
2. **主动一个局限**：加权阈值经验值、写回规范化、全量重算——显得真做过。
3. **别背公式**：除非岗位写「算法」；否则用「相似度高的配对优先」即可。
4. **被问「还有优化吗」**：从 `implementation-strategy.md` 挑 1～2 条已排期的（批量 resolve、Worker、双 ID）。

---

## 极简三连问自测

| 面试官问                       | 你答一句                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| 和 GitHub line diff 有啥区别？ | 我们按 **Markdown 块语义** 对齐，表格列表不会碎成一行行噪声。            |
| 接受以后数据去哪了？           | 改 **mdast → Markdown** emit 给父组件，再重算 diff 视图。                |
| 10 万字会不会卡？              | 现在有截断和防抖；大文档上 **Worker + 虚拟滚动 + 增量** 是明确演进方向。 |
