# 修订模式对比：现状（双稿源） vs 目标（单稿 working + 仅改渲染）

> 本文档对比 **当前 MarkdownDiff 实现** 与 **已确认的目标效果**，便于评审、排期与面试表述。  
> 不涉及具体算法公式，聚焦产品行为、数据流与架构取舍。

---

## 一、两种效果一句话

| 模式 | 一句话 |
|------|--------|
| **现状（双稿源）** | 始终维护 **old / new 两份 Markdown 源**；每次接受/拒绝改源稿并 **emit**，再 **对 old+new 全量重算 diff** 后渲染。 |
| **目标（单稿 working）** | **初次**用 old+new 算出 **带差异的渲染结果 + hunk 列表**；之后只在内存里维护 **一份 working 文档**，点接受/拒绝 **只改这份结果对应的树/渲染**；最终 **只导出一份最终 Markdown**。 |

---

## 二、用户可见行为对比

| 维度 | 现状 | 目标 |
|------|------|------|
| **进入页面** | 看到 old 与 new 对比后的合并视图（红/绿/工具栏） | 相同：初次对比得到合并视图 |
| **点「接受」** | 默认把变更写入 **old 侧** Markdown（可配置写 new / 两侧） | 在 **当前展示稿** 上采纳「新内容」，红绿标记消失或该 hunk 从待办列表移除 |
| **点「拒绝」** | 默认把变更写入 **new 侧** Markdown（回退新稿） | 在 **当前展示稿** 上保留「旧内容」，同上 |
| **点完后的画面** | 整页 diff **重新计算**（可能仍有其他 hunk） | **优先**只更新受影响区域；整体仍是「正在形成的一份文档」 |
| **离开/保存** | 可能得到 **更新后的 oldMarkdown 和/或 newMarkdown** 两个字符串 | **只得到一份** `finalMarkdown`（working 序列化结果） |
| **旧稿 / 新稿是否还在** | 父组件 v-model 可长期保留两侧，可再次全量对比 | 初次对比后，**业务上只关心 working**；old/new 可只作只读存档或丢弃 |

---

## 三、数据流与状态对比

### 3.1 现状（双稿源）

```text
                    ┌─────────────┐     ┌─────────────┐
                    │ oldMarkdown │     │ newMarkdown │
                    │  (props)    │     │  (props)    │
                    └──────┬──────┘     └──────┬──────┘
                           │ parse              │ parse
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   oldAst    │     │   newAst    │
                    └──────┬──────┘     └──────┬──────┘
                           └────────┬───────────┘
                                    ▼
                           buildMergedMdast
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              merged mdast      hunks Map         html (v-html)

用户点击 accept/reject
        │
        ▼
 resolveHunk(oldAst, newAst, hunk)  →  改一侧或两侧 AST
        │
        ▼
 mdastToMarkdown  →  emit update:oldMarkdown / update:newMarkdown
        │
        ▼
 props 变化  →  重新 parse × 2  →  重新 buildMergedMdast  →  重新 render
        （整条流水线再来一遍）
```

**核心特征**：

- **真源是两份 Markdown**（由父组件持有）。
- **hunk** 带 `path`（新稿）+ `oldPath`（旧稿）+ `oldNode` / `newNode` 快照。
- 每次操作后 **diff 视图 = 新 old 与新 new 的再次对比结果**。

### 3.2 目标（单稿 working）

```text
初次（仅一次）：
  oldMarkdown + newMarkdown
        → buildMergedMdast / 等价流程
        → initialHunks + mergedViewMdast（或带 diff 标记的展示树）
        → html₀

进入修订态：
  workingMdast（或 workingMarkdown）  ← 内存中唯一可变「定稿」
  pendingHunks                        ← 尚未处理的变更块（逐渐减少）

用户点击 accept/reject：
        │
        ▼
  根据 hunk 快照 patch workingMdast（采纳 new 或保留 old 语义）
        │
        ▼
  从 pendingHunks 移除 / 去掉该块 diff 样式
        │
        ▼
  render(workingMdast) → 更新 html（可局部，可整页）
        （通常不再对 old+new 做第二次全量 LCS）

结束：
  export finalMarkdown = mdastToMarkdown(workingMdast)
```

**核心特征**：

- **真源是一份 working**（组件内或 composable 内）。
- **old/new 仅参与第一次**「有哪些差异」；之后可只读保存或不再参与计算。
- **path 只需相对 working 树**（可逐步取消 `oldPath`）。

---

## 四、差异清单（按主题）

### 4.1 源数据与真源

| 项 | 现状 | 目标 |
|----|------|------|
| 长期维护几份稿 | 2 份（old + new） | 1 份（working / final） |
| 接受/拒绝写哪里 | 写 old 和/或 new（可配置） | 只写 working |
| 父组件 v-model | `update:oldMarkdown`、`update:newMarkdown` | 建议单一 `update:modelValue` 或 `update:finalMarkdown` |
| 初次 old/new 之后 | 仍参与每次 diff | 仅用于生成首轮 hunks，可不参与后续计算 |

### 4.2 渲染与 diff 计算

| 项 | 现状 | 目标 |
|----|------|------|
| 每次操作后 | 全量 parse + merge + render | patch working + 渲染（全量或局部） |
| 页面上是否仍显示 diff | 是，相对当前 old/new 重算 | 处理完的 hunk 不再标红绿；未处理仍显示 |
| 是否第二次 LCS | 每次操作都跑 | 初次必须；后续可选（如「相对初版」再 diff） |

### 4.3 hunk 与路径

| 项 | 现状 | 目标 |
|----|------|------|
| `path` / `oldPath` | 双侧都需要 |  mainly `path` on working |
| hunk ID 稳定性 | resolve 后全量重算，id 常变 | patch 后可控迁移或按 hunk 删除，更易预测 |
| `hunkResolve` 预设 | classic / syncBoth / mirror | 可删除或简化为 accept=新、reject=旧（相对该 hunk 快照） |

### 4.4 产品与交互

| 项 | 现状 | 目标 |
|----|------|------|
| 产品隐喻 | 双稿修订（Track Changes 对照） | 合并向导 / 审阅清单（逐项采纳后定稿） |
| 双栏左右对比 | 天然支持（两侧字符串独立更新） | 需另做只读「初版对照」；主编辑区单栏 |
| 「全部接受」 | 需多次 emit 或批量改两侧 | 可直接 `working ← new` 或批量 patch |
| 导出 | 可能导出 old、new 或两者 | **只导出一份 final** |

### 4.5 工程复杂度

| 项 | 现状 | 目标 |
|----|------|------|
| 实现与测试面 | 大（双侧 apply、策略、全量重算、竞态） | 中小（单树 patch、pending 队列、渲染更新） |
| 性能（大文档） | 每次操作整链重算，瓶颈明显 | 易做局部更新 + 无二次 LCS |
| 与现有代码兼容 | 已实现 | 需新 composable 或 Phase 2 模式开关 |

---

## 五、优缺点对比

### 5.1 现状（双稿源）

**优点**

- **语义清晰**：接受 = 旧稿追上新版，拒绝 = 新稿回退；符合 Word / Git 双版本思维。
- **两侧可长期同步**：`syncBoth`、双 v-model，适合协作、审计、双栏预览。
- **始终可再 diff**：任意时刻对当前 old/new 重新对比，视图与源一致。
- **已实现**：可直接用于需要「两份源文件都更新」的场景。

**缺点**

- **复杂**：双侧 path、`hunkResolve`、emit 回流、全量重算。
- **性能差**：每次点击 = parse × 2 + merge + 全页 v-html。
- **竞态**：连点依赖父组件更新 props，可能丢修改。
- **path/id 漂移**：重算后 hunks 与外部「已审阅 id」难对齐。
- **写回噪声**：`mdastToMarkdown` 规范化导致「只改一处、全文 diff 也变」。

### 5.2 目标（单稿 working）

**优点**

- **简单**：单源、单 export、accept/reject = patch working + 更新渲染。
- **性能好**：无需每次 old+new 全量 LCS；易做局部 DOM / 子树 render。
- **无双侧竞态**：内存一份树，连点顺序确定。
- **符合已确认需求**：「最后只保留渲染结果对应的最终 Markdown」。
- **hunk 模型可简化**：pending 队列 + 单侧 path。

**缺点**

- **失去双稿长期对照**：不能默认「拒绝 = 改外部 new 文档」 unless 额外保存 initialNew。
- **diff 会消耗完**：未处理块处理完后，界面趋近纯预览，除非保留「相对初版」叠加层。
- **审计需自建**：若要记录「采纳了哪些 hunk」，需操作日志，不能仅靠双 emit。
- **迁移成本**：需新状态机或 `revisionMode: 'dual' | 'working'` 与现有 API 并存一段时间。
- **局部 patch 仍要设计**：表格列、嵌套块 path 迁移、Markdown 往返保真等问题仍在，只是范围缩小。

---

## 六、目标效果下的推荐实现要点（概要）

1. **Phase 1（一次性）**  
   `buildMergedMdast(old, new)` → `initialHunks` + `mergedForDisplay` → 首屏 `html`。

2. **进入 working**  
   从 merged 树生成 `workingMdast`（去掉或保留 diff 元数据，按是否还要继续标未处理块决定）。

3. **accept / reject**  
   - accept：在 `workingMdast` 上写入 hunk 的 `newNode` 语义（或 insert 保留、delete 移除等）。  
   - reject：写入 `oldNode` 语义。  
   - 从 `pendingHunks` 删除；更新 html。  
   - **不** emit 双份 Markdown；可选 `emit('change', workingMarkdown)` 供父组件同步。

4. **完成**  
   `finalMarkdown = mdastToMarkdown(workingMdast)`；old/new props 可归档为只读。

5. **可选增强**  
   - 局部 `renderMdastToHtml(subtree)` + `data-diff-id` 替换。  
   - 保留 `initialOld/new` 只读侧栏，不参与计算。  
   - 「相对初版仍显示 diff」作为第二层，非必须。

---

## 七、决策建议

| 若业务需要… | 建议 |
|-------------|------|
| 两份源文件长期一致、双栏、Git 式 reject 新稿 | 保留 **现状** 或 hybrid |
| 对比页审阅 → 导出一份定稿、不关心 new 文件是否回滚 | 采用 **目标 working 模式** |
| 两者都要 | `diffMode: 'dual-source' \| 'merge-wizard'`，共享底层 parse/merge/hunk 注册，分叉 resolve 与状态 |

**已确认方向**：采用 **目标（单稿 working）** 作为主路径；old/new **仅用于初次比较出渲染结果**；接受/拒绝 **只改变渲染/working**；**最终只保留一份 Markdown**。

---

## 八、与现有文档的关系

| 文档 | 说明 |
|------|------|
| `implementation-strategy.md` | 描述的是 **现状** 架构与演进；本目标属架构分支 |
| `accept-reject-interview-answer.md` | 双侧 path + 全量重算；目标模式可删减大半 |
| `resume-highlights-interview-guide.md` | 面试时可说明「支持双稿模式，产品选定单稿合并向导简化」 |

---

## 九、总结表（可贴评审 / PR）

| | 现状 | 目标 |
|---|------|------|
| **真源** | old + new 双 Markdown | working 单 Markdown |
| **old/new 作用** | 每次 diff 都用 | 仅初次生成 hunks + 首屏 |
| **点击 accept/reject** | 改源 + 全量重算 diff | patch working + 更新渲染 |
| **输出** | 0～2 个更新后的字符串 | 1 个 finalMarkdown |
| **复杂度** | 高 | 中低 |
| **性能** | 差（全量） | 好（可增量） |
| **适合场景** | 持续双稿修订 | 一次性合并定稿 |

---

*文档版本：与「单稿 working、仅改渲染、最终一份 Markdown」需求对齐。*
