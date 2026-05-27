# 面试答题稿：接受 / 拒绝是如何实现的

> **使用场景**：面试官追问"你的 hunk 接受 / 拒绝怎么实现的？有什么难点和优化空间？"时的标准答案模板。
>
> **核心心法**：接受 / 拒绝看起来是 CRUD，但本质上是 **「带时序耦合的不可变状态机」**——按 **「数据流 → 真值表 → 5 大难点 → 7 大优化 → 时序竞态」** 五层往下讲。
>
> - 能讲清真值表 = 中级
> - 能指出双侧路径机制 + 批量漂移 = 高级
> - 能主动讲 round-trip 不保真 + async emit 竞态 bug = 资深技术专家

---

## 第 1 层：完整数据流（30 秒讲清"从点击到回写"）

```
用户点击 [接受]
   │
   ▼  (事件委托 + closest 反查 data-action + data-diff-id)
MarkdownDiff.vue · onContentClick
   │
   ▼  (从 hunks Map 反查 DiffHunk 对象)
useMarkdownDiff.ts · resolveAction(hunk, action)
   │
   ▼
markdownDiff.ts · resolveHunk
   │
   ▼  (按 HunkResolveConfig 展开 onAccept/onReject 目标)
markdownDiff.ts · resolveHunkOnAsts
   │
   ▼  (双侧依次 apply)
hunkPath.ts · applyHunkToBothSides
   │
   ▼  (按 diffType × action × side 真值表分发)
hunkPath.ts · applyHunkToAst
   │
   ├─ insert/delete → spliceAtPath
   └─ modified      → locateInAst + parentChildren[index] = newNode/oldNode
   │
   ▼
mdastToMarkdown(updatedAst)
   │
   ▼  emit('update:oldMarkdown' | 'update:newMarkdown')
父组件 v-model 触发 props 变化
   │
   ▼  watch 触发
useMarkdownDiff 全链路重算：parseMarkdown × 2 → buildMergedMdast → renderMdastToHtml
```

**关键认识**：整条链路是**同步算 + 异步回流**——`resolveAction` 内部全同步，但 emit 之后等父组件 props 回流再 rebuild 是异步的，这是后面竞态 bug 的根源。

---

## 第 2 层：三层实现拆解

### 第 1 层：UI 入口（事件委托）

```56:73:src/components/markdownDiff/MarkdownDiff.vue
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const btn = target.closest('[data-action]') as HTMLElement | null
  if (!btn) return

  e.preventDefault()
  e.stopPropagation()

  const hunkEl = btn.closest('[data-diff-id]') as HTMLElement | null
  const id = hunkEl?.getAttribute('data-diff-id')
  const action = btn.getAttribute('data-action') as 'accept' | 'reject' | null
  if (!id || !action) return

  const hunk = hunks.value.get(id)
  if (!hunk) return

  emitResolved(resolveAction(hunk, action))
}
```

**口述要点**：

- `data-diff-id` 在 hunk 元素上，`data-action` 在按钮上，**两者分离**——按钮即使包多层 DOM 也能找到所属 hunk。
- `hunks` 是 `Map<string, DiffHunk>`——O(1) 反查，避免遍历 DOM 反推。
- `stopPropagation` 防止冒泡到外层路由 / 选区监听。

### 第 2 层：业务编排（按策略展开两侧）

```440:485:src/components/markdownDiff/markdownDiff.ts
export function resolveHunkOnAsts(
  oldAst: Root,
  newAst: Root,
  hunk: DiffHunk,
  action: 'accept' | 'reject',
  resolveConfig?: HunkResolveConfig
): HunkResolveResult {
  const cfg = normalizeHunkResolveConfig(resolveConfig)
  const target = action === 'accept' ? cfg.onAccept : cfg.onReject
  const sides = expandHunkResolveTarget(target)
  const { oldAst: nextOld, newAst: nextNew } = applyHunkToBothSides(...)
  return {
    oldAst: nextOld,
    newAst: nextNew,
    updateOld: sides.includes('old'),
    updateNew: sides.includes('new'),
  }
}
```

**口述要点**：

- 策略可配置：`onAccept: 'old' | 'new' | 'both'`，默认 classic（accept → old，reject → new），预设 syncBoth、mirror。
- **`'both'` 在 `expandHunkResolveTarget` 中展开为 `['old', 'new']`**——单一概念展开成数组，下层只处理"侧"不处理"both"，符合开闭原则。
- 只对被 update 的侧调用 `mdastToMarkdown`——这是 hot path 优化，序列化大 AST 不便宜。

### 第 3 层：核心算法（applyHunkToAst 真值表）

```101:149:src/components/markdownDiff/hunkPath.ts
export function applyHunkToAst(
  ast: Root,
  hunk: DiffHunk,
  action: 'accept' | 'reject',
  side: 'old' | 'new'
): Root {
  const result = cloneAst(ast)
  const path = side === 'old' ? [...hunk.oldPath] : [...hunk.path]
  const isAccept = action === 'accept'
  const isReject = action === 'reject'

  switch (hunk.diffType) {
    case 'insert': {
      if (side === 'old') {
        if (isAccept && hunk.newNode) spliceAtPath(result, path, 'insert', cloneAst(hunk.newNode))
      } else if (isReject) {
        spliceAtPath(result, path, 'remove')
      }
      break
    }
    case 'delete': {
      if (side === 'old') {
        if (isAccept) spliceAtPath(result, path, 'remove')
      } else if (isReject && hunk.oldNode) {
        spliceAtPath(result, path, 'insert', cloneAst(hunk.oldNode))
      }
      break
    }
    case 'modified': {
      const located = locateInAst(result, path)
      if (!located) break
      const { parentChildren, index } = located
      if (isAccept && hunk.newNode) parentChildren[index] = cloneAst(hunk.newNode)
      else if (isReject && hunk.oldNode) parentChildren[index] = cloneAst(hunk.oldNode)
      break
    }
  }
  return result
}
```

---

## 第 3 层：接受 / 拒绝的完整真值表（必背）

12 个组合，**只有 6 个有效**——其余是 no-op：

| diffType | action | side=old | side=new |
|---|---|---|---|
| **insert** | accept | `splice insert newNode`（旧侧补上新节点） | no-op |
| **insert** | reject | no-op | `splice remove`（新侧删除该节点） |
| **delete** | accept | `splice remove`（旧侧删除该节点） | no-op |
| **delete** | reject | no-op | `splice insert oldNode`（新侧补回旧节点） |
| **modified** | accept | `parent[idx] = newNode` | `parent[idx] = newNode` |
| **modified** | reject | `parent[idx] = oldNode` | `parent[idx] = oldNode` |

### 记忆口诀

- `accept` = "采纳新版本作为最终结果" → 让 old 侧向 new 看齐 / 让 new 侧确认 newNode
- `reject` = "回退到旧版本" → 让 new 侧向 old 看齐 / 让 old 侧确认 oldNode
- `insert` / `delete` 是**单侧独有节点**，只在"对侧"才有事可做（同侧已经是想要的状态）
- `modified` 两侧都有节点，无论改哪侧都是"替换"动作

---

## 第 4 层：五大核心难点（面试官最容易追问的地方）

### 难点 1：**双侧路径不同步**——这是整个机制的根基

**问题**：用户的修改可能在文档中段插入或删除整段，导致**同一逻辑位置在 old AST 和 new AST 中的下标不同**。

**例**：

```
old:  [P1, P2, P3]            new: [P1, P2_modified, P_new, P3]
       0   1   2                    0   1            2      3
```

对于 P3，oldPath = `[2]`，newPath = `[3]`。如果应用 hunk 时混用，splice 错位整篇崩。

**解决**：`DiffHunk` 同时保存 `path`（new 侧）和 `oldPath`（old 侧）：

```10:23:src/components/markdownDiff/types.ts
export type DiffHunk = {
  id: string
  diffType: 'insert' | 'delete' | 'modified'
  /** 在 new 文档中从 root 到目标节点的下标路径 */
  path: number[]
  /** 在 old 文档中从 root 到目标节点的下标路径 */
  oldPath: number[]
  oldNode?: MdastNode
  newNode?: MdastNode
}
```

构建时由 `buildMergedFromDiff` 用 `newAstIndex` / `oldAstIndex` **双游标独立推进**：insert 只 ++new，delete 只 ++old，equal 两者同步。这让一个 hunk 自带两套坐标系。

### 难点 2：**批量接受的 path 漂移**

**问题**：用户勾选 5 个 hunk 批量 accept：

- 第 1 个 hunk path=`[2]` accept 后，原本 path=`[3]` 的第 2 个 hunk **实际节点已经漂移到 `[4]`**（如果 hunk 1 是 insert）或 **`[2]`**（如果是 delete）。
- 当前实现没有真正的批量 API，只有"逐个 resolve + 整体重算 hunks"——这意味着批量操作必须**串行等 watch 触发 rebuild 完**才能拿到新 hunks Map 处理下一个。

**根本原因**：path 是"相对当前 AST"的下标，**对修改不是不变量**。

**正确做法**（如果要实现批量）：

- **按 path 倒序 apply**：从文档末尾往前改，前面节点的 path 不会因后面的修改而漂移。
- 或者用**节点引用**而不是 path：保留 `hunk.targetNodeRef`（实际节点对象），通过遍历找节点而非下标定位——但这要求 AST 不被 clone（违反不可变原则）。

### 难点 3：**Markdown round-trip 不保真**

**问题**：`mdastToMarkdown` 输出的不是用户原文，而是**规范化后**的 Markdown：

```116:118:src/components/markdownDiff/markdownDiff.ts
export function mdastToMarkdown(ast: Root): string {
  return toMarkdown(ast, { extensions: [gfmToMarkdown()], bullet: '-' })
}
```

**后果**：

- 用户原文 `* item` 会变成 `- item`（bullet 强制 `-`）
- `__strong__` 可能变成 `**strong**`
- 表格列对齐符 `|---|` 的空格、`>` 引用的空格数都会被规范化
- 代码块的 ` ``` ` 行号位置、首尾空行可能不一致

**用户体感**：只接受了一个 hunk，但整篇文档"看起来"被重写了——`update:oldMarkdown` emit 出去的字符串与原 prop 字符串**全文 diff 都有差异**，外部如果做 Git 提交会出现大片噪声修改。

**缓解方案**：

- 用 `mdast-util-to-markdown` 的 `formatting` 选项保留更多原貌；
- 或者**保留源 position 信息**（remark-parse 默认带 `position: { start, end }`），只对被改动子树重新序列化，剩余部分按原 offset 字符串拼接——这是真正的"局部 patch"，但实现复杂度高。

### 难点 4：**`modified` 不支持局部接受**

**问题**：`modified` hunk 只能整块替换——但实际场景中一个 paragraph 可能有 5 处文字修改，用户可能只想接受其中 3 处。

```133:142:src/components/markdownDiff/hunkPath.ts
case 'modified': {
  const located = locateInAst(result, path)
  if (!located) break
  const { parentChildren, index } = located
  if (isAccept && hunk.newNode) parentChildren[index] = cloneAst(hunk.newNode)
  else if (isReject && hunk.oldNode) parentChildren[index] = cloneAst(hunk.oldNode)
  break
}
```

当前实现是 `parentChildren[index] = cloneAst(hunk.newNode)`——直接整块替换为 newNode，丢失了"内部 inline diff"的粒度。

**根本原因**：DiffHunk 在容器级别（如 paragraph）才注册，内部的 `<del>` / `<ins>` 只是视觉标记，没有自己的 hunk ID。

**改进方向**：把 inline diff 也注册成子 hunk（带 `parentHunkId` 字段），形成两级 hunk 树；UI 上 paragraph 显示"接受全部 / 拒绝全部 / 逐个选择"。

### 难点 5：**`'both'` 模式的语义陷阱**

**问题**：`onAccept: 'both'` 看起来很合理（"两边都同步"），但有隐藏的语义不一致：

- `insert + accept + both`：old 侧 splice insert（OK），new 侧 no-op（newNode 已经在那里了）——✅ 一致
- `delete + accept + both`：old 侧 splice remove（OK），new 侧 no-op（newNode 本就没有）——✅ 一致
- **`modified + accept + both`**：两侧都 `parent[idx] = newNode`——但 old 侧用的是 `hunk.oldPath`，new 侧用的是 `hunk.path`。如果两侧的祖先节点本身有 modified hunk **尚未 resolve**，oldNode/newNode 引用的是"原始未变"的快照，apply 后两侧节点完全一致，**但其上层 modified hunk 还是会显示"还有差异"**——因为 modified 是基于路径判断的，不是基于内容。

**用户体感**：连续 accept-both 多次后，文档"明明两边一样了"，但视图上还显示 hunk 标记——必须刷新整页才消失。

**根本原因**：`buildMergedMdast` 是无状态函数，每次根据当前 oldAst/newAst 重算，但 hunk 的 `oldNode/newNode` 是**构建时的快照**，不随后续 apply 更新。

---

## 第 5 层：七大可优化点（按 ROI 排序）

### 优化 1：用 `structuredClone` 替代 `JSON.parse(JSON.stringify())`

```88:91:src/components/markdownDiff/hunkPath.ts
/** 深拷贝 AST（JSON） */
export function cloneAst<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T
}
```

**问题**：`JSON.parse(JSON.stringify())` 在 10w 字 AST 上单次 50-200ms，且会丢失 `undefined` / `Date` / `Map` 等。

**方案**：浏览器原生 `structuredClone`（V8 实现，**比 JSON 路径快 30-50%**，且支持更多类型）。

**风险**：mdast 节点可能含函数（如 `data.hChildren` 偶尔是函数）—— `structuredClone` 不支持。需要先验证 AST 内确无函数。

### 优化 2：增量 apply——避免全量 rebuild

**现状**：每次 resolve 后 emit 新 Markdown → 父组件 props 变化 → watch 触发 → 完整重跑 `parseMarkdown × 2 → buildMergedMdast → renderMdastToHtml`。

**问题**：用户接受一个 hunk 后等 1-2s 才看到 UI 更新（大文档下）。

**方案**：

- 内部维护一份"活的 mergedAst"，resolve 后**就地修改该子树**（用 `data-diff-id` 反查 DOM 节点 + outerHTML 局部替换），跳过 v-html 全量重挂。
- 只对**被影响子树**重新跑 `renderMdastToHtml` 片段（unified 支持子树渲染）。
- `update:oldMarkdown` 只在用户主动需要 export 时才 `mdastToMarkdown`，平时跑在 idle callback 里。

### 优化 3：**真·批量 API + path 倒序**

**问题**：当前没有批量接口，用户连选 10 个 hunk → 10 次 emit + 10 次重算 + 10 次 v-html 替换 = 卡顿。

**方案**：

```ts
function resolveBatch(
  hunks: DiffHunk[],
  action: 'accept' | 'reject',
  cfg?: HunkResolveConfig
): { oldMarkdown?: string; newMarkdown?: string }
```

实现要点：

- 按 `path` **字典序倒序**排序（最深、最后的先处理），避免前面的 splice 让后面的 path 失效；
- 对同一个 AST 连续应用所有 hunk 后才 `mdastToMarkdown`，一次 emit；
- watch 只触发一次重建。

**收益**：批量场景从 O(N²) 降到 O(N)。

### 优化 4：**双 ID 设计**——稳定语义 ID + 临时定位 ID

**问题**：`createStableHunkId` 把 path 编进 ID，**接受任何一个 hunk 都会让后续所有 hunk 的 ID 漂移**——外部维护的"已审阅 hunk 集合"全部失效。

**方案**：

- `semanticId`：基于规范化文本内容的 hash（如 SHA-1 of `extractTextFromNode(newNode || oldNode)`），**与 path 无关，跨 rebuild 稳定**。
- `locationId`：当前 `createStableHunkId` 的输出，含 path，用于 DOM 定位。
- 父组件用 `semanticId` 做持久化 / 协作同步；UI 内部用 `locationId` 反查。
- rebuild 后用 `semanticId` 做迁移映射，原有"已审阅"状态可恢复。

### 优化 5：**冲突检测**——hunk 已失效时给出错误

**现状**：如果父组件异步改了 `oldMarkdown`（如另一个面板编辑），原 hunk 的 `path` 可能定位到不同节点，但 `applyHunkToAst` 无声 no-op 或定位到错的位置。

```77:86:src/components/markdownDiff/hunkPath.ts
const index = path[path.length - 1]
if (!Number.isInteger(index) || index < 0 || index >= current.length) {
  if (Number.isInteger(index) && index >= 0 && index === current.length) {
    return { parentChildren: current, index }
  }
  return null    // ← 返回 null，上层无声 break
}
```

**方案**：apply 前做"指纹校验"——比较定位到的节点与 `hunk.oldNode/newNode` 的 `nodeStructureSignature` 或文本 hash，不匹配抛 `HunkConflictError`，让上层提示用户"该修改已过期"。

### 优化 6：**撤销 / 重做（undo/redo）**

**现状**：resolve 单向，只能依赖父组件维护历史。

**方案**：在 `useMarkdownDiff` 内部维护操作栈：

```ts
const history: Array<{ hunk: DiffHunk; action; prevOld: Root; prevNew: Root }> = []
function undo() { /* 回到上一帧 */ }
function redo() { /* 回到下一帧 */ }
```

配合 `Ctrl+Z` / `Ctrl+Shift+Z` 快捷键，企业 IDE-like 必备。

### 优化 7：**`spliceAtPath` 的冗余 clone**

```202:208:src/components/markdownDiff/hunkPath.ts
if (op === 'insert' && nodeToInsert) {
  const idx = Math.min(Math.max(0, lastIndex), parentChildren.length)
  parentChildren.splice(idx, 0, nodeToInsert)
}
```

调用处已经传了 `cloneAst(hunk.newNode)`，但 `applyHunkToAst` 开头又 `cloneAst(ast)` 整棵——**每次 apply 至少有 2 次大克隆**。

**方案**：

- 整棵 clone 改为 **immer 风格的结构共享**（只克隆受影响的祖先链，其他子树共用）；
- 或者用 `cloneDeep` 替代 JSON（更快）+ 用 weakset 标记"本次 apply 已 clone"避免重复。

**预计收益**：大文档下 apply 耗时减 50-80%。

---

## 第 6 层：面试官最爱追问的延伸题（提前准备答案）

### Q1：如果用户在 modified hunk 上 accept，但其内部一个 inline `<del>` 该怎么算？

**答**：当前实现把整块替换为 newNode——内部 inline `<del>` 表达的"删除某词"等同于一并接受。如果要支持"接受外层 modified 但拒绝内部某个 inline 修改"，需要把 inline diff 也注册成子 hunk，形成层级关系（`parentHunkId`），并在 UI 上提供"接受全部 / 仅接受部分"两套交互。

### Q2：为什么不在客户端缓存中间态 mergedAst，每次 emit 后局部 patch 而要走全量 rebuild？

**答**：当前架构选择了"**简单一致性 > 性能**"——`buildMergedMdast` 是纯函数，输入相同输出确定，开发心智模型简单。局部 patch 需要处理"子树 path 漂移"、"hunk ID 重映射"、"DOM 节点引用稳定性"等一系列状态同步问题，实现 + 测试成本可能上升 3-5x。这是已知 trade-off，准备在大文档场景出现实际性能反馈后再上。

### Q3：`emit('update:oldMarkdown', ...)` 是同步的，但 watch 是异步的——会不会有竞态？

**答**：**会**。考虑用户**快速连点 2 个 accept**：

1. 第 1 次 click → emit `oldMd_v1` → 父组件 setState（异步）→ watch 未触发；
2. 第 2 次 click → 此时 `oldAst.value` 还是旧的（因为父 props 还没回流）→ `resolveHunk` 用的是 v0 oldAst → 算出的 `oldMd_v2'` **不包含第 1 次的修改** → emit `oldMd_v2'` → 父组件覆盖了 `oldMd_v1`，**第 1 次修改丢失！**

**缓解方案**：

- 在 `resolveAction` 内部维护一个"待 commit 队列"，等所有 emit 走完 flush 后再用最新 oldAst 重算；
- 或者**禁用按钮直到 watch flush**（用 `pending: Ref<boolean>` 暴露给 UI，配合 `disabled`）；
- 或者把 oldAst 改为**内部状态**而非 prop 衍生 computed，每次 resolve 立刻就地更新，**输出方向**仍 emit 给父组件，但内部读取不依赖父组件回流。

这是当前架构的一个**真实潜在 bug**，能在面试中主动指出来是大加分项。

---

## 答题节奏建议

整段回答**控制在 5-7 分钟**，按这个节奏：

| 阶段 | 时长 | 内容 | 目的 |
|---|---|---|---|
| 1. 数据流 10 步 | 30 秒 | 从点击到回写画一遍 | 立刻给"全景"感 |
| 2. 真值表 6 行 | 60 秒 | 主动列出 12 组合 / 6 有效 | 证明真懂语义 |
| 3. 双侧路径机制 | 60 秒 | 例子 + path/oldPath 双坐标 | 展示对根基的理解 |
| 4. 5 个难点 | 120 秒 | 至少讲到批量漂移 + round-trip 不保真 | 体现踩坑经验 |
| 5. 3-4 个优化点 | 90 秒 | 选 ROI 高的讲（增量 apply / 批量 API / 双 ID） | 展示工程化思维 |
| 6. 主动抛 async 竞态 bug | 60 秒 | 第 3 个延伸题 | 让面试官眼前一亮 |

---

## 一句话收尾（最有杀伤力的表态）

> "接受 / 拒绝看起来是个 CRUD 操作，但本质上是个**带有时序耦合的不可变状态机**——`DiffHunk` 是一对双侧坐标的快照，AST 是被快照引用的真值源；任何让两者偏移的因素（**批量操作的 path 漂移、async emit 的状态回流、外部并发修改**）都会让 apply 静默走偏。这套机制的 80% 复杂度不在算法，而在**如何让这个状态机在 Vue 异步响应式 + 用户连点 + 父组件可能并发改源 三种压力下保持一致性**。"

---

## 核心心法

- **看代码**：6 行真值表 + spliceAtPath + locateInAst 就能讲完 happy path。
- **看难点**：双侧路径、批量漂移、round-trip 不保真、modified 不可拆、both 模式的语义滞后——5 个都是**只有真的写过 + debug 过才知道的**。
- **看优化**：structuredClone、增量 apply、批量 API、双 ID、冲突检测、undo/redo、clone 去重——7 个都是**有明确收益、能落地排期的**改进项。
- **决胜点**：主动抛 async emit 竞态 bug——能从"happy path"跳到"并发 / 时序异常"层面思考，是高级与资深的分水岭。
