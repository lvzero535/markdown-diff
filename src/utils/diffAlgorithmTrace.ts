/**
 * LCS (Longest Common Subsequence) - 最长公共子序列算法
 * 
 * 示例：
 * old: A B C D
 * new: A C E D
 * LCS: A C D
 * 合并结果: A(equal) B(delete) C(equal) E(insert) D(equal)
 * 
 * 合并两个子序列，使用 key 属性判断元素是否相同
 * @param oldAst 旧的子序列
 * @param newAst 新的子序列
 * @returns 合并后的子序列，每个元素包含 __data 标记
 */
export function mergeSubsequence<T extends { key: string }>(oldAst: Array<T>, newAst: Array<T>) {
  // 构建 LCS 表
  const lcs = computeLCS(oldAst, newAst)
  
  // 标记旧序列中的元素状态
  const oldMarked = markSequence(oldAst, lcs, 'old')
  // 标记新序列中的元素状态
  const newMarked = markSequence(newAst, lcs, 'new')
  
  // 合并两个标记后的序列
  return mergeMarkedSequences(oldMarked, newMarked, oldAst, newAst)
}

/**
 * 计算两个序列的最长公共子序列（基于 key 匹配）
 * @param oldAst 旧序列
 * @param newAst 新序列
 * @returns LCS 元素的 key 数组
 */
function computeLCS<T extends { key: string }>(oldAst: Array<T>, newAst: Array<T>): string[] {
  const m = oldAst.length
  const n = newAst.length
  
  // 创建 DP 表，dp[i][j] 表示 oldAst[0..i-1] 和 newAst[0..j-1] 的 LCS 长度
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
  
  // 填充 DP 表
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldAst[i - 1].key === newAst[j - 1].key) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  
  // 回溯获取 LCS
  const lcs: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (oldAst[i - 1].key === newAst[j - 1].key) {
      lcs.unshift(oldAst[i - 1].key)
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  
  return lcs
}

/**
 * 标记序列中每个元素的状态
 * @param sequence 待标记的序列
 * @param lcs LCS 的 key 集合
 * @param type 序列类型 ('old' 或 'new')
 */
function markSequence<T extends { key: string }>(
  sequence: Array<T>,
  lcs: string[],
  type: 'old' | 'new'
) {
  const lcsSet = new Set(lcs)
  const marked: Array<T & { __data: { diffType: 'delete' | 'insert' | 'equal', node?: { oldNode: T, newNode: T } } }> = []
  
  for (const item of sequence) {
    const isInLCS = lcsSet.has(item.key)
    let diffType: 'delete' | 'insert' | 'equal'
    
    if (type === 'old') {
      diffType = isInLCS ? 'equal' : 'delete'
    } else {
      diffType = isInLCS ? 'equal' : 'insert'
    }
    
    marked.push({
      ...item,
      __data: { diffType }
    })
  }
  
  return marked
}

/**
 * 合并两个已标记的序列，保持正确的顺序
 */
function mergeMarkedSequences<T extends { key: string }>(
  oldMarked: Array<T & { __data: { diffType: 'delete' | 'insert' | 'equal' } }>,
  newMarked: Array<T & { __data: { diffType: 'delete' | 'insert' | 'equal' } }>,
  oldAst: Array<T>,
  newAst: Array<T>
) {
  const result: Array<T & { __data: { diffType: 'delete' | 'insert' | 'equal', node?: { oldNode: T, newNode: T } } }> = []
  let i = 0, j = 0
  
  // 构建旧序列的 key -> node 映射
  const oldNodeMap = new Map<string, T>()
  for (const node of oldAst) {
    oldNodeMap.set(node.key, node)
  }
  
  // 构建新序列的 key -> node 映射
  const newNodeMap = new Map<string, T>()
  for (const node of newAst) {
    newNodeMap.set(node.key, node)
  }
  
  while (i < oldMarked.length && j < newMarked.length) {
    const oldItem = oldMarked[i]
    const newItem = newMarked[j]
    
    if (oldItem.key === newItem.key) {
      // 相同元素，添加 node 信息
      result.push({
        ...newItem,
        __data: {
          diffType: 'equal' as const,
          node: {
            oldNode: oldNodeMap.get(oldItem.key)!,
            newNode: newNodeMap.get(newItem.key)!
          }
        }
      })
      i++
      j++
    } else if (oldItem.__data.diffType === 'delete') {
      // 旧元素需要删除，先添加
      result.push(oldItem)
      i++
    } else if (newItem.__data.diffType === 'insert') {
      // 新元素需要插入，先添加
      result.push(newItem)
      j++
    } else {
      // 都不在 LCS 中，但 key 不同，按顺序添加
      result.push(oldItem)
      result.push(newItem)
      i++
      j++
    }
  }
  
  // 添加剩余元素
  while (i < oldMarked.length) {
    result.push(oldMarked[i])
    i++
  }
  
  while (j < newMarked.length) {
    result.push(newMarked[j])
    j++
  }
  
  return result
}

/**
 * 测试用例
 */
export const testCases = [
  // 测试用例 1: 基本场景（注释中的示例）
  {
    name: '基本场景',
    old: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }],
    new: [{ key: 'A' }, { key: 'C' }, { key: 'E' }, { key: 'D' }],
    expected: [
      { key: 'A', __data: { diffType: 'equal', node: { oldNode: { key: 'A' }, newNode: { key: 'A' } } } },
      { key: 'B', __data: { diffType: 'delete' } },
      { key: 'C', __data: { diffType: 'equal', node: { oldNode: { key: 'C' }, newNode: { key: 'C' } } } },
      { key: 'E', __data: { diffType: 'insert' } },
      { key: 'D', __data: { diffType: 'equal', node: { oldNode: { key: 'D' }, newNode: { key: 'D' } } } }
    ]
  },
  
  // 测试用例 2: 完全相同
  {
    name: '完全相同',
    old: [{ key: 'A' }, { key: 'B' }, { key: 'C' }],
    new: [{ key: 'A' }, { key: 'B' }, { key: 'C' }],
    expected: [
      { key: 'A', __data: { diffType: 'equal', node: { oldNode: { key: 'A' }, newNode: { key: 'A' } } } },
      { key: 'B', __data: { diffType: 'equal', node: { oldNode: { key: 'B' }, newNode: { key: 'B' } } } },
      { key: 'C', __data: { diffType: 'equal', node: { oldNode: { key: 'C' }, newNode: { key: 'C' } } } }
    ]
  },
  
  // 测试用例 3: 完全不同
  {
    name: '完全不同',
    old: [{ key: 'A' }, { key: 'B' }],
    new: [{ key: 'C' }, { key: 'D' }],
    expected: [
      { key: 'A', __data: { diffType: 'delete' } },
      { key: 'B', __data: { diffType: 'delete' } },
      { key: 'C', __data: { diffType: 'insert' } },
      { key: 'D', __data: { diffType: 'insert' } }
    ]
  },
  
  // 测试用例 4: 新增元素
  {
    name: '新增元素',
    old: [{ key: 'A' }, { key: 'B' }],
    new: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }],
    expected: [
      { key: 'A', __data: { diffType: 'equal', node: { oldNode: { key: 'A' }, newNode: { key: 'A' } } } },
      { key: 'B', __data: { diffType: 'equal', node: { oldNode: { key: 'B' }, newNode: { key: 'B' } } } },
      { key: 'C', __data: { diffType: 'insert' } },
      { key: 'D', __data: { diffType: 'insert' } }
    ]
  },
  
  // 测试用例 5: 删除元素
  {
    name: '删除元素',
    old: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }],
    new: [{ key: 'A' }, { key: 'D' }],
    expected: [
      { key: 'A', __data: { diffType: 'equal', node: { oldNode: { key: 'A' }, newNode: { key: 'A' } } } },
      { key: 'B', __data: { diffType: 'delete' } },
      { key: 'C', __data: { diffType: 'delete' } },
      { key: 'D', __data: { diffType: 'equal', node: { oldNode: { key: 'D' }, newNode: { key: 'D' } } } }
    ]
  },
  
  // 测试用例 6: 中间插入和删除
  {
    name: '中间插入和删除',
    old: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }, { key: 'E' }],
    new: [{ key: 'A' }, { key: 'X' }, { key: 'C' }, { key: 'Y' }, { key: 'E' }],
    expected: [
      { key: 'A', __data: { diffType: 'equal', node: { oldNode: { key: 'A' }, newNode: { key: 'A' } } } },
      { key: 'B', __data: { diffType: 'delete' } },
      { key: 'X', __data: { diffType: 'insert' } },
      { key: 'C', __data: { diffType: 'equal', node: { oldNode: { key: 'C' }, newNode: { key: 'C' } } } },
      { key: 'Y', __data: { diffType: 'insert' } },
      { key: 'E', __data: { diffType: 'equal', node: { oldNode: { key: 'E' }, newNode: { key: 'E' } } } }
    ]
  },
  
  // 测试用例 7: 空数组
  {
    name: '空数组',
    old: [],
    new: [{ key: 'A' }, { key: 'B' }],
    expected: [
      { key: 'A', __data: { diffType: 'insert' } },
      { key: 'B', __data: { diffType: 'insert' } }
    ]
  },
  
  // 测试用例 8: 顺序变化
  {
    name: '顺序变化',
    old: [{ key: 'A' }, { key: 'B' }, { key: 'C' }],
    new: [{ key: 'C' }, { key: 'B' }, { key: 'A' }],
    expected: [
      { key: 'A', __data: { diffType: 'delete' } },
      { key: 'C', __data: { diffType: 'insert' } },
      { key: 'B', __data: { diffType: 'equal', node: { oldNode: { key: 'B' }, newNode: { key: 'B' } } } },
      { key: 'C', __data: { diffType: 'delete' } },
      { key: 'A', __data: { diffType: 'insert' } }
    ]
  }
]

/**
 * 运行测试用例
 */
export function runTests() {
  let passed = 0
  let failed = 0
  
  for (const testCase of testCases) {
    const result = mergeSubsequence(testCase.old, testCase.new)
    
    // 比较结果与期望
    const isPassed = JSON.stringify(result) === JSON.stringify(testCase.expected)
    
    if (isPassed) {
      console.log(`✅ ${testCase.name}: 通过`)
      passed++
    } else {
      console.log(`❌ ${testCase.name}: 失败`)
      console.log(`   期望:`, JSON.stringify(testCase.expected, null, 2))
      console.log(`   实际:`, JSON.stringify(result, null, 2))
      failed++
    }
  }
  
  console.log(`\n测试完成: 通过 ${passed} 个, 失败 ${failed} 个`)
  return { passed, failed }
}