import DiffMatchPatch from 'diff-match-patch'

const dmp = new DiffMatchPatch()

export function diffText(oldText: string, newText: string) {
  const diffs = dmp.diff_main(oldText, newText)

  // ⭐ 非常重要：优化可读性
  dmp.diff_cleanupSemantic(diffs)

  return diffs
}