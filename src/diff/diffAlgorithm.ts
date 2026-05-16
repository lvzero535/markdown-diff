export type DiffType = 'equal' | 'insert' | 'delete'

export type DiffNode<T> = T & {
  __data: {
    diffType: DiffType
    node?: { oldNode: T; newNode: T }
  }
}

/**
 * 使用 LCS 回溯直接生成 diff 结果
 */
export function mergeSubsequence<T extends { key: string }>(
  oldAst: T[],
  newAst: T[]
): DiffNode<T>[] {
  const dp = buildDP(oldAst, newAst)
  return backtrackDiff(dp, oldAst, newAst)
}

function buildDP<T extends { key: string }>(oldAst: T[], newAst: T[]) {
  const m = oldAst.length
  const n = newAst.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldAst[i - 1].key === newAst[j - 1].key) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp
}

function backtrackDiff<T extends { key: string }>(
  dp: number[][],
  oldAst: T[],
  newAst: T[]
): DiffNode<T>[] {
  const result: DiffNode<T>[] = []
  let i = oldAst.length
  let j = newAst.length

  while (i > 0 || j > 0) {
    // equal
    if (
      i > 0 &&
      j > 0 &&
      oldAst[i - 1].key === newAst[j - 1].key
    ) {
      result.unshift({
        ...newAst[j - 1],
        __data: {
          diffType: 'equal',
          node: {
            oldNode: oldAst[i - 1],
            newNode: newAst[j - 1],
          },
        },
      })
      i--
      j--
      continue
    }

    // delete
    if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      result.unshift({
        ...oldAst[i - 1],
        __data: { diffType: 'delete' },
      })
      i--
      continue
    }

    // insert
    if (j > 0) {
      result.unshift({
        ...newAst[j - 1],
        __data: { diffType: 'insert' },
      })
      j--
      continue
    }
  }

  return result
}

export function runTests() {
  const tests = [
    {
      name: '基本场景',
      old: ['A','B','C','D'],
      new: ['A','C','E','D']
    },
    {
      name: '完全相同',
      old: ['A','B','C'],
      new: ['A','B','C']
    },
    {
      name: '完全不同',
      old: ['A','B'],
      new: ['C','D']
    },
    {
      name: '顺序变化',
      old: ['A','B','C'],
      new: ['C','B','A']
    }
  ]

  for (const t of tests) {
    const res = mergeSubsequence(
      t.old.map(k => ({ key:k })),
      t.new.map(k => ({ key:k }))
    )

    console.log('\n====', t.name, '====')
    console.log(res.map(r => `${r.key}:${r.__data.diffType}`).join(' '))
  }
}