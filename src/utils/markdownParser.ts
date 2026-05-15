import { remark } from 'remark'
import remarkGfm from 'remark-gfm'

export function parseMarkdown(markdown: string) {
  return remark().use(remarkGfm).parse(markdown)
}