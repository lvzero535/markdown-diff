/**
 * MD-001 测试用例
 */
import { describe, it, expect } from 'vitest'
import {
  buildDP,
  backtrack,
  weightedLCS,
  classicLCS,
  example1Matchers,
  type AlignOp,
} from './weighted-maximum-common-subsequence'

function totalMatchWeight(ops: AlignOp[]): number {
  return ops.filter((o): o is Extract<AlignOp, { op: 'MATCH' }> => o.op === 'MATCH').reduce((s, o) => s + o.weight, 0)
}

describe('MD-001 weighted LCS', () => {
  it('示例1: A,C vs A,B,C — 得分 2，中间 INSERT', () => {
    const { maxScore, ops } = example1Matchers()
    expect(maxScore).toBeCloseTo(2.0, 5)
    expect(ops.map((o) => o.op)).toEqual(['MATCH', 'INSERT', 'MATCH'])
    expect(totalMatchWeight(ops)).toBeCloseTo(2.0, 5)
  })

  it('示例2: Hello,World vs Hello,Vue', () => {
    const old = ['Hello', 'World']
    const neu = ['Hello', 'Vue']
    const sim = (a: string, b: string) => {
      if (a === b) return 1
      if (a === 'Hello' && b === 'Hello') return 1
      return 0.1
    }
    const threshold = 0.35
    const { ops } = weightedLCS(
      old.length,
      neu.length,
      (i, j) => sim(old[i], neu[j]) >= threshold,
      (i, j) => sim(old[i], neu[j])
    )
    expect(ops[0]).toEqual({ op: 'MATCH', oldIndex: 0, newIndex: 0, weight: 1 })
    expect(ops.filter((o) => o.op === 'DELETE')).toHaveLength(1)
    expect(ops.filter((o) => o.op === 'INSERT')).toHaveLength(1)
  })

  it('示例3: 经典 LCS [1,2,3] vs [2,3,4]，得分 2', () => {
    const { maxScore, ops } = classicLCS([1, 2, 3], [2, 3, 4])
    expect(maxScore).toBe(2)
    const matches = ops.filter((o) => o.op === 'MATCH') as Extract<AlignOp, { op: 'MATCH' }>[]
    expect(matches.map((m) => [m.oldIndex, m.newIndex])).toEqual([
      [1, 0],
      [2, 1],
    ])
  })

  it('空 vs [A] — 仅 INSERT', () => {
    const { maxScore, ops } = weightedLCS(0, 1, () => false, () => 0)
    expect(maxScore).toBe(0)
    expect(ops).toEqual([{ op: 'INSERT', newIndex: 0 }])
  })

  it('[A] vs 空 — 仅 DELETE', () => {
    const { ops } = weightedLCS(1, 0, () => false, () => 0)
    expect(ops).toEqual([{ op: 'DELETE', oldIndex: 0 }])
  })

  it('完全相同 — 全 MATCH', () => {
    const { maxScore, ops } = classicLCS(['A', 'B'], ['A', 'B'])
    expect(maxScore).toBe(2)
    expect(ops.every((o) => o.op === 'MATCH')).toBe(true)
  })

  it('buildDP + backtrack 与 weightedLCS 一致', () => {
    const oldLabels = ['A', 'C']
    const newLabels = ['A', 'B', 'C']
    const similarity: Record<string, Record<string, number>> = {
      A: { A: 1.0, B: 0.46, C: 0 },
      C: { A: 0, B: 0, C: 1.0 },
    }
    const threshold = 0.35
    const m = oldLabels.length
    const n = newLabels.length
    const canMatch = (i: number, j: number) => (similarity[oldLabels[i]]?.[newLabels[j]] ?? 0) >= threshold
    const weight = (i: number, j: number) => similarity[oldLabels[i]]?.[newLabels[j]] ?? 0
    const { dp, weights } = buildDP(m, n, canMatch, weight)
    const ops = backtrack(m, n, canMatch, dp, weights)
    const full = weightedLCS(m, n, canMatch, weight)
    expect(ops).toEqual(full.ops)
    expect(totalMatchWeight(ops)).toBe(full.maxScore)
  })
})
