import { describe, it, expect } from 'vitest'
import { sanitize } from 'hast-util-sanitize'
import { diffSanitizeSchema } from './sanitizeSchema'

describe('diffSanitizeSchema', () => {
  it('应保留 code 的 no-highlight 与 del/ins 的 diff 类名', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {
                className: ['hljs', 'language-javascript', 'no-highlight'],
              },
              children: [
                {
                  type: 'element',
                  tagName: 'del',
                  properties: { className: ['diff-delete'] },
                  children: [{ type: 'text', value: 'old' }],
                },
                {
                  type: 'element',
                  tagName: 'ins',
                  properties: { className: ['diff-insert'] },
                  children: [{ type: 'text', value: 'new' }],
                },
              ],
            },
          ],
        },
      ],
    }

    const result = sanitize(tree as never, diffSanitizeSchema) as {
      children: Array<{
        children: Array<{
          properties: { className?: string[] }
          children: Array<{ tagName?: string; properties?: { className?: string[] } }>
        }>
      }>
    }

    const code = result.children[0].children[0]
    expect(code.properties.className).toContain('no-highlight')
    const tags = code.children.map((c) => c.tagName)
    expect(tags).toContain('del')
    expect(tags).toContain('ins')
    const del = code.children.find((c) => c.tagName === 'del')
    expect(del?.properties?.className).toContain('diff-delete')
  })
})
