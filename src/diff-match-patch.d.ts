declare module 'diff-match-patch' {
  export class diff_match_patch {
    diff_main(a: string, b: string): [number, string][]
  }
  export const DIFF_DELETE: number
  export const DIFF_INSERT: number
  export const DIFF_EQUAL: number
}
