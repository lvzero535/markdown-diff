/**
 * Working 模式 hunk 解析单元测试
 */
import { describe, it, expect } from 'vitest'
import { parseMarkdown, buildMergedMdast } from './markdownDiff'
import { cloneAst } from './hunkPath'
import {
  applyHunkToWorkingMdast,
  workingMdastToMarkdown,
  locateHunkInMdast,
} from './workingHunk'
import type { MergedMdastRoot } from './types'

function setupWorking(oldMd: string, newMd: string) {
  const { mdast, hunks } = buildMergedMdast(parseMarkdown(oldMd), parseMarkdown(newMd))
  const working = cloneAst(mdast) as MergedMdastRoot
  const pending = new Map(hunks)
  return { working, pending, hunks }
}

describe('applyHunkToWorkingMdast', () => {
  it('拒绝 insert 应从 working 树移除新增块', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const { working, hunks } = setupWorking(oldMd, newMd)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')!
    applyHunkToWorkingMdast(working, insertHunk, 'reject')
    expect(workingMdastToMarkdown(working).trim()).toBe(oldMd.trim())
  })

  it('接受 insert 应保留新增段落在 final 中', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const { working, hunks } = setupWorking(oldMd, newMd)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')!
    applyHunkToWorkingMdast(working, insertHunk, 'accept')
    expect(workingMdastToMarkdown(working)).toContain('New paragraph')
  })

  it('含行内 diff 的 working 树应能序列化为 Markdown（不抛 unknown node diff）', () => {
    const oldMd = 'The quick brown fox jumps over the lazy dog.'
    const newMd = 'The quick brown fox leaps over the sleepy dog.'
    const { working } = setupWorking(oldMd, newMd)
    expect(() => workingMdastToMarkdown(working)).not.toThrow()
    const md = workingMdastToMarkdown(working)
    expect(md.length).toBeGreaterThan(0)
  })

  it('resolve 后 hunk id 应仍能在树中定位（接受后该 id 节点已去标）', () => {
    const oldMd = '# A\n'
    const newMd = '# A\n\nNew paragraph\n'
    const { working, hunks } = setupWorking(oldMd, newMd)
    const insertHunk = [...hunks.values()].find((h) => h.diffType === 'insert')!
    expect(locateHunkInMdast(working, insertHunk.id)).not.toBeNull()
    applyHunkToWorkingMdast(working, insertHunk, 'accept')
    expect(locateHunkInMdast(working, insertHunk.id)).toBeNull()
  })
})
