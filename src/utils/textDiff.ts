export interface TextDiffResult {
  type: 'add' | 'remove' | 'equal'
  text: string
}

export function textDiff(oldText: string, newText: string): TextDiffResult[] {
  if (!oldText && !newText) {
    return []
  }
  
  if (!oldText) {
    return [{ type: 'add', text: newText }]
  }
  
  if (!newText) {
    return [{ type: 'remove', text: oldText }]
  }
  
  const matrix = createMatrix(oldText, newText)
  const diffs = backtrack(matrix, oldText, newText, oldText.length, newText.length)
  
  return diffs.reverse()
}

function createMatrix(a: string, b: string): number[][] {
  const matrix: number[][] = []
  
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = []
    for (let j = 0; j <= b.length; j++) {
      if (i === 0) {
        matrix[i][j] = j
      } else if (j === 0) {
        matrix[i][j] = i
      } else if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        )
      }
    }
  }
  
  return matrix
}

function backtrack(
  matrix: number[][],
  a: string,
  b: string,
  i: number,
  j: number
): TextDiffResult[] {
  const diffs: TextDiffResult[] = []
  
  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    diffs.push(...backtrack(matrix, a, b, i - 1, j - 1))
    diffs.push({ type: 'equal', text: a[i - 1] })
  } else if (j > 0 && (i === 0 || matrix[i][j - 1] <= matrix[i - 1][j])) {
    diffs.push(...backtrack(matrix, a, b, i, j - 1))
    diffs.push({ type: 'add', text: b[j - 1] })
  } else if (i > 0 && (j === 0 || matrix[i][j - 1] > matrix[i - 1][j])) {
    diffs.push(...backtrack(matrix, a, b, i - 1, j))
    diffs.push({ type: 'remove', text: a[i - 1] })
  }
  
  return diffs
}

export function mergeDiffResults(diffs: TextDiffResult[]): TextDiffResult[] {
  if (diffs.length === 0) return []
  
  const merged: TextDiffResult[] = []
  let current = { ...diffs[0] }
  
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i].type === current.type) {
      current.text += diffs[i].text
    } else {
      merged.push(current)
      current = { ...diffs[i] }
    }
  }
  
  merged.push(current)
  return merged
}

export function compareMarkdownText(oldMd: string, newMd: string): TextDiffResult[] {
  const diffs = textDiff(oldMd, newMd)
  return mergeDiffResults(diffs)
}