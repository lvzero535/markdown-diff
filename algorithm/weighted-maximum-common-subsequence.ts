/**
 * MD-001: 带权最长公共子序列 + 回溯对齐
 *
 * 与 src/components/markdownDiff/markdownDiff.ts 中 buildDP / backtrackDiff 同构的抽象实现。
 */

export type AlignOp =
  | { op: 'MATCH'; oldIndex: number; newIndex: number; weight: number }
  | { op: 'DELETE'; oldIndex: number }
  | { op: 'INSERT'; newIndex: number }

export type MatchFn = (i: number, j: number) => boolean
export type WeightFn = (i: number, j: number) => number

const EPS = 1e-9

/**
 * 构建 dp 与 weights 表。
 * dp[i][j] = old[0..i) 与 new[0..j) 的最大配对得分。
 */
export function buildDP(
  m: number,
  n: number,
  canMatch: MatchFn,
  weight: WeightFn
): { dp: number[][]; weights: number[][] } {
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  const weights: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const o = i - 1
      const p = j - 1
      if (canMatch(o, p)) {
        const w = weight(o, p)
        weights[i][j] = w
        dp[i][j] = Math.max(dp[i - 1][j - 1] + w, dp[i - 1][j], dp[i][j - 1])
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return { dp, weights }
}

/**
 * 从 (m,n) 回溯得到 MATCH / DELETE / INSERT 序列（时间顺序）。
 */
export function backtrack(
  m: number,
  n: number,
  canMatch: MatchFn,
  dp: number[][],
  weights: number[][],
  /** 平局时优先 DELETE 再 INSERT（与 markdownDiff 一致） */
  preferDeleteOnTie = true
): AlignOp[] {
  const result: AlignOp[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    const canPair = i > 0 && j > 0 && canMatch(i - 1, j - 1)

    if (canPair && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + weights[i][j])) < EPS) {
      result.unshift({
        op: 'MATCH',
        oldIndex: i - 1,
        newIndex: j - 1,
        weight: weights[i][j],
      })
      i--
      j--
      continue
    }

    const takeDelete =
      i > 0 &&
      (j === 0 ||
        (preferDeleteOnTie
          ? dp[i - 1][j] > dp[i][j - 1] + EPS
          : dp[i - 1][j] >= dp[i][j - 1] - EPS))

    if (takeDelete) {
      result.unshift({ op: 'DELETE', oldIndex: i - 1 })
      i--
      continue
    }

    if (j > 0) {
      result.unshift({ op: 'INSERT', newIndex: j - 1 })
      j--
    }
  }

  return result
}

/** 建表 + 回溯的一站式入口 */
export function weightedLCS(
  m: number,
  n: number,
  canMatch: MatchFn,
  weight: WeightFn
): { maxScore: number; ops: AlignOp[]; dp: number[][] } {
  const { dp, weights } = buildDP(m, n, canMatch, weight)
  const ops = backtrack(m, n, canMatch, dp, weights)
  return { maxScore: dp[m][n], ops, dp }
}

/** 严格相等序列：退化为经典 LCS（权重恒为 1） */
export function classicLCS<T>(oldSeq: T[], newSeq: T[], equals: (a: T, b: T) => boolean = (a, b) => a === b) {
  const m = oldSeq.length
  const n = newSeq.length
  return weightedLCS(
    m,
    n,
    (i, j) => equals(oldSeq[i], newSeq[j]),
    () => 1
  )
}

/** 示例 1：A,C vs A,B,C 的 canMatch / weight */
export function example1Matchers() {
  const oldLabels = ['A', 'C']
  const newLabels = ['A', 'B', 'C']
  const similarity: Record<string, Record<string, number>> = {
    A: { A: 1.0, B: 0.46, C: 0 },
    C: { A: 0, B: 0, C: 1.0 },
  }
  const threshold = 0.35

  const canMatch: MatchFn = (i, j) => (similarity[oldLabels[i]]?.[newLabels[j]] ?? 0) >= threshold
  const weight: WeightFn = (i, j) => similarity[oldLabels[i]]?.[newLabels[j]] ?? 0

  return weightedLCS(oldLabels.length, newLabels.length, canMatch, weight)
}
