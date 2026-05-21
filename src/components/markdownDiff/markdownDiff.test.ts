/**
 * Markdown diff 核心逻辑单元测试（任务 #18）
 */
import { describe, it, expect } from 'vitest'
import {
  parseMarkdown,
  buildMergedMdast,
  renderMdastToHtml,
  applyHunk,
  resolveHunk,
  mdastToMarkdown,
  diffText,
} from './markdownDiff'
import { scenarios } from '../../data/mockData'
import { HUNK_RESOLVE_PRESETS } from './types'
import { createStableHunkId, locateInAst } from './hunkPath'

describe('createStableHunkId', () => {
  it('相同路径与节点类型应生成相同 id', () => {
    const node = { type: 'paragraph', children: [{ type: 'text', value: 'hi' }] }
    const a = createStableHunkId([0], 'insert', node)
    const b = createStableHunkId([0], 'insert', node)
    expect(a).toBe(b)
  })
})

describe('locateInAst', () => {
  it('应正确定位根级子节点', () => {
    const root = parseMarkdown('# Title\n\nBody')
    const loc = locateInAst(root, [0])
    expect(loc).not.toBeNull()
    expect(loc!.index).toBe(0)
    expect(loc!.parentChildren[0].type).toBe('heading')
  })
})

describe('applyHunk', () => {
  it('拒绝 insert 应从 new 文档移除对应块', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const oldAst = parseMarkdown(oldMd)
    const newAst = parseMarkdown(newMd)
    const { hunks } = buildMergedMdast(oldAst, newAst)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')
    expect(insertHunk).toBeDefined()
    const patched = applyHunk(newAst, insertHunk!, 'reject')
    expect(mdastToMarkdown(patched).trim()).toBe(oldMd.trim())
  })

  it('接受 insert 应向 old 文档插入对应块', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const oldAst = parseMarkdown(oldMd)
    const newAst = parseMarkdown(newMd)
    const { hunks } = buildMergedMdast(oldAst, newAst)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')
    const patched = applyHunk(oldAst, insertHunk!, 'accept')
    expect(mdastToMarkdown(patched)).toContain('New paragraph')
  })
})

describe('resolveHunk hunkResolve config', () => {
  it('syncBoth 接受时应同时返回 old 与 new', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const oldAst = parseMarkdown(oldMd)
    const newAst = parseMarkdown(newMd)
    const { hunks } = buildMergedMdast(oldAst, newAst)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')!
    const result = resolveHunk(oldAst, newAst, insertHunk, 'accept', HUNK_RESOLVE_PRESETS.syncBoth)
    expect(result.oldMarkdown).toBeDefined()
    expect(result.newMarkdown).toBeDefined()
    expect(result.oldMarkdown).toContain('New paragraph')
  })

  it('mirror 接受时应只更新 new', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const oldAst = parseMarkdown(oldMd)
    const newAst = parseMarkdown(newMd)
    const { hunks } = buildMergedMdast(oldAst, newAst)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')!
    const result = resolveHunk(oldAst, newAst, insertHunk, 'accept', HUNK_RESOLVE_PRESETS.mirror)
    expect(result.oldMarkdown).toBeUndefined()
    expect(result.newMarkdown).toBeDefined()
  })
})

describe('diffText char mode', () => {
  it('代码 diff 不应把换行后的行首缩进标进上一段 insert', () => {
    const oldRev = `function calculateRevenue(sales) {
  return sales.reduce((sum, item) => sum + item.amount, 0);
}`
    const newRev = `function calculateRevenue(sales) {
  const tax = 0.08;
  return sales.reduce((sum, item) => sum + item.amount * (1 + tax), 0);
}`
    const diffs = diffText(oldRev, newRev, 'char')
    expect(diffs.map(([, v]) => v).join('')).toBe(newRev)

    const taxInsert = diffs.find(([t, v]) => t === 1 && v.includes('const tax'))
    expect(taxInsert).toBeTruthy()
    expect(taxInsert![1]).not.toMatch(/\n[ \t]+$/)
    expect(taxInsert![1]).toMatch(/^\n[ \t]*const tax/)

    const returnEqual = diffs.find(([t, v]) => t === 0 && v.includes('return sales'))
    expect(returnEqual?.[1]).toMatch(/^\n[ \t]*return sales/)
  })

  it('字符级 diff 应标出插入段且拼接结果等于新文本', () => {
    const oldCode = 'function greet(name) {\n  return "Hello " + name;\n}'
    const newCode = 'function greet(name) {\n  return "Hello, " + name + "!";\n}'
    const diffs = diffText(oldCode, newCode, 'char')
    expect(diffs.some(([t]) => t === 1)).toBe(true)
    const merged = diffs.map(([, v]) => v).join('')
    expect(merged).toBe(newCode)
  })
})

describe('renderMdastToHtml code diff styling', () => {
  it('代码块字符级 diff 应保留 diff-insert 且拼接为新版代码', () => {
    const scenario = scenarios.find((s) => s.name.includes('代码块：内容修改'))!
    const { mdast } = buildMergedMdast(
      parseMarkdown(scenario.oldMarkdown),
      parseMarkdown(scenario.newMarkdown)
    )
    const rootChild = mdast.children[0] as {
      type: string
      children?: Array<{ type: string; diffType?: string; value?: string }>
    }
    expect(rootChild.type).toBe('code-diff')
    const diffParts = (rootChild.children ?? []).filter((c) => c.type === 'diff')
    expect(diffParts.some((c) => c.diffType === 'insert')).toBe(true)

    const mergedCode = (rootChild.children ?? [])
      .map((c) => (c.type === 'text' || c.type === 'diff' ? String(c.value ?? '') : ''))
      .join('')
    expect(mergedCode).toContain('Hello, ')

    const html = renderMdastToHtml(mdast)
    expect(html).toContain('diff-insert')
    expect(html).toContain('no-highlight')
    expect(html).toMatch(/<ins[^>]*class="[^"]*diff-insert/)
    expect(html).not.toMatch(/<del[^>]*class="[^"]*diff-delete[^"]*"[^>]*>[\s\S]*return "Hello /)
  })

  it('综合场景（102）中 JavaScript 代码块应为新版结构且标绿新增片段', () => {
    const scenario = scenarios[scenarios.length - 1]
    const { mdast } = buildMergedMdast(
      parseMarkdown(scenario.oldMarkdown),
      parseMarkdown(scenario.newMarkdown)
    )
    const codeBlock = mdast.children.find(
      (c) => (c as { type?: string }).type === 'code-diff'
    ) as { children?: Array<{ type: string; diffType?: string; value?: string }> } | undefined
    expect(codeBlock).toBeTruthy()
    const parts = codeBlock?.children?.filter((c) => c.type === 'diff') ?? []
    expect(parts.some((c) => c.diffType === 'insert')).toBe(true)

    const mergedCode = (codeBlock?.children ?? [])
      .map((c) => (c.type === 'text' || c.type === 'diff' ? String(c.value ?? '') : ''))
      .join('')
    expect(mergedCode).toContain('const tax = 0.08')
    expect(mergedCode).toContain('* (1 + tax)')
    expect(mergedCode).not.toMatch(
      /return sales\.reduce\([^)]+\)[\s\S]*return sales\.reduce/
    )

    const html = renderMdastToHtml(mdast)
    expect(html).toContain('diff-insert')
    expect(html).toContain('no-highlight')
    expect(html).toMatch(/const[\s\S]*tax[\s\S]*0\.08/)
    expect(html).toMatch(/\+\s*tax\)/)
  })
})

describe('scenario 19 inlineCode insert', () => {
  it('新增行内代码后后续文本应可见', () => {
    const scenario = scenarios.find((s) => s.name.includes('行内代码：添加'))!
    const { mdast } = buildMergedMdast(
      parseMarkdown(scenario.oldMarkdown),
      parseMarkdown(scenario.newMarkdown)
    )
    const para = mdast.children[0] as { children?: MdastNode[] }
    const html = renderMdastToHtml(mdast)
    expect(html).toContain('function to output text')
    expect(html).toContain('print')
    const texts = (para.children ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => String(c.value ?? ''))
      .join('')
    expect(texts).toContain('function to output text')
  })
})

describe('scenario 19 inlineCode insert', () => {
  it('新增行内代码后其后的文本应可见', () => {
    const scenario = scenarios.find((s) => s.name.includes('行内代码：添加'))!
    const { mdast } = buildMergedMdast(
      parseMarkdown(scenario.oldMarkdown),
      parseMarkdown(scenario.newMarkdown)
    )
    const para = mdast.children[0] as { children?: MdastNode[] }
    const mergedText = (para.children ?? [])
      .map((c) => {
        if (c.type === 'text') return String(c.value ?? '')
        if (c.type === 'diff') return String(c.value ?? '')
        return ''
      })
      .join('')
    expect(mergedText).toContain('function to output text')

    const html = renderMdastToHtml(mdast)
    expect(html).toContain('function to output text')
    expect(html).toMatch(/<ins[^>]*><code>print<\/code><\/ins>/)
    expect(html).not.toMatch(/<code><\/code>/)
  })
})

type MdastNode = { type: string; value?: string; children?: MdastNode[]; diffType?: string }

describe('buildMergedMdast', () => {
  it('表格场景应注册带非空 id 的子级 hunk', () => {
    const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const newMd = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |'
    const { hunks } = buildMergedMdast(parseMarkdown(oldMd), parseMarkdown(newMd))
    const nested = [...hunks.values()].filter((h) => h.path.length > 1)
    expect(nested.length).toBeGreaterThan(0)
    nested.forEach((h) => {
      expect(h.id.length).toBeGreaterThan(0)
    })
  })
})
