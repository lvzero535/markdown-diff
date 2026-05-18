# Dynamic programming for LCS backtracking

_Exported on 5/18/2026 at 13:11:00 GMT+8 from Cursor (3.4.20)_

---

**User**

@src/utils/markdownDiff.ts:496-511 这里为什么要构建一个DP做回溯，我的理解是，直接找出最LCS后，在新旧节点列表中剩余的节点直接按原来的位置插入到LCS中不就行了吗？

---

**Cursor**

查看 `markdownDiff.ts` 中 DP 构建与回溯的完整实现，以便准确解释设计原因。

你的直觉里有一半是对的：**最终展示顺序**确实就是「LCS 里的匹配项 + 中间穿插的 delete/insert」。但「先求出一个 LCS，再把剩余节点按原下标塞回去」和当前实现之间，差在三件事。

## 1. LCS 只给「最长有多长」，不给「具体怎么对齐」

`buildDP` 填的是前缀 LCS **长度**，不是一条唯一的匹配路径：

```504:509:c:\code\markdown-diff\src\utils\markdownDiff.ts
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        oldAst[i - 1].key === newAst[j - 1].key
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
```

同一个长度往往对应**多条** LCS。diff 要的是一条确定的 **edit script**（先删还是先插、哪两个 `paragraph` 配哪一对），不是「集合里有哪些 key 相同」。

回溯就是在 `dp` 上做 tie-break，固定选一条路：

```545:553:c:\code\markdown-diff\src\utils\markdownDiff.ts
    if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      result.unshift({ ...oldAst[i - 1], __data: { diffType: 'delete' } })
      i--
      continue
    }
    if (j > 0) {
      result.unshift({ ...newAst[j - 1], __data: { diffType: 'insert' } })
      j--
```

没有这一步，你只有「最长能配多少对」，不知道**哪一对配哪一对**。

## 2. 「按原位置插入」不能替代「向前看」

若理解成：从左到右扫，能配就 `equal`，不能配就把旧/新剩余项插到 LCS 缝隙里——那是**贪心双指针**，不保证 LCS 最长。

例子（`key` 即节点类型）：

| 旧 | A | C | D |
| 新 | A | B | C |

- 最优 LCS：`A, C`（长度 2）→ 合理 diff：`A` equal → `C` delete + `B` insert → `D` delete（或等价顺序）
- 贪心：配完 `A` 后遇到 `C` vs `B`，若**先删 C**，后面可能对不齐，`equal` 变少，多出无意义的 insert/delete

DP 正是在每个 `(i,j)` 上比较「跳过旧」和「跳过新」谁还能保留更长的公共子序列；回溯只是把这条最优决策**倒序**打成 `insert/delete/equal` 序列。  
所以你说的「插回 LCS」——**插的顺序**必须由这条路径决定，不能单靠「在旧/新里的下标」局部决定。

## 3. 同 key 时，「原下标」不够定对齐

`nodeKey` 只含类型和少量结构字段，两个段落可能都是 `paragraph|`：

```447:470:c:\code\markdown-diff\src\utils\markdownDiff.ts
function nodeKey(node: any): string {
  const parts = [node.type]
  // ...
  return parts.join('|')
}
```

旧：`[para1, para2]`，新：`[para2', para1']`（内容都改了，key 仍相同）  
LCS 长度可以是 2，但有两种配法：`(1↔1,2↔2)` 或 `(1↔2,2↔1)`。  
「按原下标插入剩余」若不做全局最优，很容易把**第 1 段旧文**配到**第 2 段新文**，后面 `mergeEqualNodes` 会整段标成 modified，diff 噪音很大。  
回溯 + `dp[i-1][j] >= dp[i][j-1]` 是在多种最长对齐里选**一种稳定规则**（这里略偏先删旧）。

---

## 和你想法的对应关系

| 你的想法         | 实际                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| 先找 LCS         | `buildDP` 算的是「任意 LCS 都共享」的长度表                                                    |
| 剩余按原位置插入 | `backtrackDiff` 输出的顺序就是：在**一条** LCS 对齐下，delete/insert 穿插的位置                |
| 似乎不必 DP      | 要**最长**匹配 + **确定**穿插顺序，就要 DP（或 Myers 等等价算法）；只贪心或只按 index 插会错配 |

若只关心「能跑、不要求 LCS 最长」，可以写更简单的双指针 diff，但当前 `mergeSubsequence` 的目标是：**尽量少地把结构相同的块标成 insert/delete**，再对 `equal` 做 `mergeEqualNodes` 里的文本 diff——这依赖 LCS 最优对齐。

---

## 小结

- **DP**：解决「向前看、LCS 最长」
- **回溯**：把一张长度表还原成**一条** `equal | insert | delete` 序列（含同 key 多节点时的配对）
- **不是** DP 多余，而是「LCS 集合 + 按原下标插入」没有唯一、最优的插入规则；回溯就是在实现你说的「插到 LCS 中间」，但插入规则来自全局 DP，不是局部下标。

若你愿意，我可以拿 `mockData.ts` 里某段真实 AST 画一条具体回溯路径（旧/新各几步、`i/j` 怎么变）。

---

**User**

@src/data/mockData.ts 这个例子里第3行和第11行，是一样，匹配成一个新增，和一个修改了，为什么会出现这种情况？

---

**Cursor**

查看 mock 数据与 diff 匹配逻辑，分析第 3 行与第 11 行为何被误判。

运行 diff 逻辑，查看 AST 节点如何被匹配。

你的判断很敏锐：**第 3 行和第 11 行文本完全相同，却出现一个「新增」和一个「修改」**，不是内容比较错了，而是 **LCS 用结构 key 匹配时，把多个段落当成了同一种节点**。

## 根因：`paragraph` 的 key 都一样

`nodeKey` 对普通段落只返回 `paragraph`，没有区分正文内容：

```447:470:c:\code\markdown-diff\src\utils\markdownDiff.ts
function nodeKey(node: any): string {
  const parts = [node.type]
  // ...
  switch (node.type) {
    case 'heading':
      parts.push(`d${node.depth}`)
      break
    // paragraph 没有 case，只有 type
  }
  return parts.join('|')
}
```

旧 AST 顶层是 4 个节点，新 AST 是 5 个：

| 下标 | 旧版                              | 新版                                    |
| ---- | --------------------------------- | --------------------------------------- |
| 0    | `heading\|d1`                     | `heading\|d1`                           |
| 1    | `paragraph` — Looking ahead…      | `paragraph` — **同一句**                |
| 2    | `paragraph` — Our product mix…    | `paragraph` — …very steadily            |
| 3    | `paragraph` — The marketing team… | `paragraph` — **新增** We also added…   |
| 4    | —                                 | `paragraph` — The marketing team… Asia… |

对 LCS 来说，序列是：

- 旧：`[heading, paragraph, paragraph, paragraph]`
- 新：`[heading, paragraph, paragraph, paragraph, paragraph]`

四个 `paragraph` **key 完全相同**，LCS 只保证「能配几对 `paragraph`」，**不保证配的是哪一段正文**。

## 回溯时发生了什么

中间多了一段新段落（`We also added…`）之后，从右下角回溯会**优先按 key 对角配对**。一种典型结果是：

1. 末尾两个 `paragraph` 先配上 → 营销段 ↔ 营销段（合理）
2. 再往上：旧「product mix」↔ 新「We also added」（key 都是 `paragraph`，内容完全不同）
3. 再往上：旧「Looking ahead」↔ 新「…very steadily」（同样 key 对上，内容不同）
4. 还剩一个新版的「Looking ahead」没人配对 → 只能标成 **`insert`**
5. 第 3 步那对 `equal` 进 `mergeEqualNodes` → 标成 **`modified`**

所以你看到：

- **新增**：新 AST 里多出来的那条「Looking ahead…」（其实和旧版第 3 行一样）
- **修改**：旧版「Looking ahead…」被错误地和「Our product mix…very steadily」配成一对

同一句文字没有被标成 `unchanged`，而是拆成了「多出来的 insert」+「错配的 modified」。

## 和你之前问题的关系

你之前问「算出 LCS 后，把剩余节点按原位置插进去行不行」——在这个例子里问题更根本：

- 不是「插回去」的策略不对；
- 而是 **LCS 在 key 重复时，本身就不唯一**，回溯的 tie-break（`dp[i-1][j] >= dp[i][j-1]` 时优先 delete）会选出一套**语义上错位**的配对。

只要中间有 insert/delete，多个相同 key 的节点就会**整体滑位**，相同正文也可能对不上。

## 怎么修（方向）

要让第 3/11 行正确变成 `unchanged`，需要让匹配更「有身份」，例如：

1. **段落 key 带上内容指纹**（如首句 hash、归一化文本前缀）— 简单但重排时可能误配
2. **LCS 相等条件**：`key` 相同 **且** 内容足够相似（或 `nodesDeepEqual`）
3. **两遍算法**：先用唯一 key 做 LCS，再对剩余 `paragraph` 用 Myers / 编辑距离做二次对齐
4. **唯一 id**：解析时给每个块一个稳定 id（若 Markdown 里没有就只能靠内容）

当前实现是「结构 diff」（按块类型对齐），不是「语义 diff」（按正文对齐）；在 mock 这种「中间插一段、前后有相同段落」的场景下，就会出现你看到的假象。

如果你愿意，我可以直接在 `nodeKey` / `backtrackDiff` 里改一版，让这个 mock 里相同段落稳定显示为 unchanged。

---

**User**

修改方案有哪些，如tiptap是如何做的？

---

**Cursor**

查阅 tiptap 的 diff/协同实现，并整理可行的修改方案。

你这个问题可以分成两层：**你们这类「静态 AST diff」可以怎么改**，以及 **Tiptap 生态里其实有几套不同的做法**。

---

## 你们当前方案的问题（一句话）

顶层 LCS 只按 `nodeKey`（如 `paragraph`）匹配，**不区分是哪一段正文**；中间插入一段后，多个同 key 节点会在回溯时**整体错位**，于是出现「同一句 = 新增 + 修改」。

---

## 修改方案对比（按改动量 → 效果）

### 方案 A：加强 `nodeKey`（最小改动）

在 `paragraph` 等类型上加入**内容指纹**，例如归一化纯文本的前 N 字、hash、或 `type|hash(text)`。

| 优点                             | 缺点                                         |
| -------------------------------- | -------------------------------------------- |
| 改 `nodeKey` 即可，DP/回溯不用动 | 段落重排后可能误配                           |
| mock 里「相同段落」能对上        | 标题只改一个词、结构相同正文不同，仍可能错配 |

适合：快速修 mock，接受「重排场景不完美」。

---

### 方案 B：LCS 的「相等」条件加内容（中等改动）

DP 里只有 `key` 相同 **且** `nodesDeepEqual`（或相似度 &gt; 阈值）才算 `dp[i-1][j-1]+1`。

| 优点                                     | 缺点                                    |
| ---------------------------------------- | --------------------------------------- |
| 相同段落不会被当成任意 `paragraph` 互换  | LCS 更短，中间未匹配段变多              |
| 逻辑仍集中在 `buildDP` / `backtrackDiff` | 回溯 tie-break 仍影响「哪段删、哪段插」 |

适合：在现有架构上修错位，不引入新依赖。

---

### 方案 C：块级 Myers / `diff` 库（中等）

把每个顶层块序列化成**稳定且尽量唯一**的 token（如 `paragraph:${normalizedText}`），对 token 数组做 Myers / `diffLines`。

| 优点                                     | 缺点                           |
| ---------------------------------------- | ------------------------------ |
| 插入中间时，未变块 token 不同 → 对齐更稳 | token 设计不好仍会碰撞         |
| 和 Git/VS Code 行 diff 思路接近          | 仍是扁平序列，树结构要递归再做 |

适合：Markdown 以「块」为主要编辑单位时。

---

### 方案 D：递归树 diff（推荐，接近 ProseMirror 社区实践）

**不**在整层做一次扁平 LCS，而是对每个父节点的 `children`：

1. **前后缀扫描**：从两端用 `nodesDeepEqual` 去掉不变段
2. **中间匹配**：在剩余区间找「相同/最相似」子序列（可按类型 + 文本相似度，不只 `paragraph`）
3. **剩余部分**：同类型 → 递归；文本 → 字符级 diff；否则 delete + insert

这和 [prosemirror-diff](https://github.com/pubpub/prosemirror-diff) / [hamflx/prosemirror-diff](https://github.com/hamflx/prosemirror-diff) 的 `patchDocumentNode` 思路一致：**先砍掉确定不变的，再在中间做「按内容找锚点」，最后处理残差**。

| 优点                                                     | 缺点                           |
| -------------------------------------------------------- | ------------------------------ |
| mock 场景：前后相同段会留在 prefix，中间新增不会拖乱前面 | 实现量比 A/B 大                |
| 语义上更像「文档 diff」                                  | 需要定义 `matchNodes` / 相似度 |

适合：你们这种 mdast 树 + 块内文本 diff 的架构，长期最稳。

---

### 方案 E：两阶段对齐（LCS + 相似度重配）

1. 先用结构 key 做 LCS（粗对齐）
2. 对标记为 equal 但 `nodesDeepEqual` 为 false 的，或多余的 insert/delete，用**文本相似度**（Levenshtein、余弦等）做二次配对，再改成 equal

| 优点                       | 缺点                 |
| -------------------------- | -------------------- |
| 可渐进式加在现有代码上     | 二次配对规则要仔细调 |
| 能修「LCS 配错对」的后遗症 | 边界情况多           |

---

### 方案 F：不 diff 两份快照，而是记操作（协同路线）

若文档有**稳定节点 ID**（Yjs / CRDT / 每次编辑带 id），diff = 操作日志回放，不做 LCS 猜对齐。

| 优点                             | 缺点                       |
| -------------------------------- | -------------------------- |
| 不会把同一段配成 insert+modified | 需要协同或编辑时打 id      |
| 可带作者、时间                   | 纯 Markdown 文件对比不适用 |

---

## Tiptap 是怎么做的？（其实是多条产品线）

Tiptap **没有公开一套**「扁平 LCS + `paragraph` key」的实现；不同功能用的模型不同：

### 1. AI Toolkit — `diffUtility`（静态两文档对比）

文档：[Diff utility](https://tiptap.dev/docs/content-ai/capabilities/ai-toolkit/api-reference/diff-utility)

- 输入：两份 Tiptap JSON / ProseMirror `Node`
- 输出：`Change[]`，每项有 `rangeA`、`rangeB`（在旧/新文档中的区间）
- 三种模式：
  - **`block`**：顶层块当作原子，整块增删改
  - **`inline`**：字符级 diff
  - **`smart`（默认）**：块级 + 行内混合，并可用 `groupInlineChanges` 等合并成可读的建议

实现细节在 **`@tiptap-pro/ai-toolkit` 闭源包**里，文档未公开算法；从 API 看，是 **schema 感知的文档 diff**，不是「只比 node type」。

和你们最接近的是：若选 `block`，也要求**块级 token 能区分内容**；`smart` 则会在块对齐后再做 inline。

---

### 2. Snapshot Compare — 版本对比（协同 / 快照）

文档：[Snapshot Compare](https://tiptap.dev/docs/collaboration/documents/snapshot-compare)

这条路和「两份 Markdown 字符串 LCS」**完全不同**：

- 基于 **`ChangeTrackingTransform`**：从版本 A 到版本 B 的**已记录步骤**（谁改的、插入/删除区间）
- `compareVersions({ fromVersion, toVersion })` → `diffSet`（`inline-insert` / `block-delete` / `block-update` 等）
- 用 ProseMirror **Decoration** 渲染，可带 `userId` 归因

也就是说：**对齐问题在编辑时已经通过操作历史解决了**，不是事后对两个快照做模糊 LCS。  
纯离线 Markdown 对比没有这份历史，只能走方案 D/E 或 C。

---

### 3. 社区参考：prosemirror-diff（开源，常被拿来对标）

典型流程（与你们差异最大的一点）：

```text
patchDocumentNode(old, new):
  1. 类型不同 → 整块 delete + insert
  2. nodesDeepEqual → 直接 equal
  3. 去掉公共 prefix / suffix（按深度相等）
  4. matchNodes：在中间找「相同节点序列」锚点（不是只看 type）
  5. 剩余：同 type 递归；text 用 diff-match-patch；否则打 insert/delete mark
```

**不会**出现「所有 paragraph 共用一个 key」这种设计。

---

## 和 Tiptap 的对照表

| 维度         | 你们现在       | Tiptap AI `diffUtility`               | Tiptap Snapshot Compare | prosemirror-diff             |
| ------------ | -------------- | ------------------------------------- | ----------------------- | ---------------------------- |
| 输入         | mdast 两份 AST | ProseMirror Node ×2                   | 版本快照 + 操作历史     | PM Node ×2                   |
| 对齐依据     | 结构 `key`     | 未公开（schema + smart/block/inline） | Transform steps         | 深度相等 + 中间 match + 递归 |
| 中间插入同段 | 易错位         | 预期更好（块/内容感知）               | 不涉及猜对齐            | prefix/suffix + matchNodes   |
| 文本细节     | `diff` / DMP   | inline 模式                           | inline-\* diff 类型     | DMP on text                  |
| 接受/拒绝    | hunk id        | Suggestion API                        | 版本恢复 / hideDiff     | DiffMark                     |

---

## 针对你们项目的建议

| 目标                        | 建议                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| 快速修 mock                 | **方案 B** 或 **A+B**（相等条件 + 段落 key 带文本 hash）              |
| 长期质量、贴近编辑器        | **方案 D**（递归 + 前后缀 + 中间按内容 match），参考 prosemirror-diff |
| 产品要对标 Tiptap「比文档」 | 对外说是 **smart 块+行内两层**；实现上 ≈ D + 现有 `mergeTextChildren` |
| 有协同/版本库               | 再考虑 **方案 F**（操作流），类似 Snapshot Compare                    |

若你打算动代码，我建议优先 **方案 B（严格相等才进 LCS）+ 段落 key 加短文本指纹** 作为第一步，验证 mock 后再是否升级到完整的 **方案 D**。需要的话我可以按你们 `markdownDiff.ts` 结构给一版具体改法（改哪些函数、伪代码）。

---
