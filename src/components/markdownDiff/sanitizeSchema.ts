import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'

type AttrList = NonNullable<Schema['attributes']>[string]

function extendAttrs(
  base: AttrList | undefined,
  extra: AttrList
): AttrList {
  return [...(base ?? []), ...extra]
}

/**
 * 供 rehype-sanitize 使用的 schema。
 *
 * 默认 GitHub schema 会：
 * - 仅允许 `del`/`ins` 的 `cite`，剥掉 `className`（diff-delete/diff-insert 失效）；
 * - 仅允许 `code` 的 `language-*` class，剥掉 `hljs` / `no-highlight`，
 *   导致 rehype-highlight 覆盖已手动的 del/ins 高亮。
 */
export const diffSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ['className', /^language-./, 'hljs', 'no-highlight'],
      'dataDiffId',
      'dataDiffType',
    ],
    pre: extendAttrs(defaultSchema.attributes?.pre, [
      'dataDiffId',
      'dataDiffType',
    ]),
    // 允许 diff 样式类（也可写 'className' 放行任意 class，此处收紧为 diff-*）
    del: extendAttrs(defaultSchema.attributes?.del, [
      ['className', 'diff-delete'],
    ]),
    ins: extendAttrs(defaultSchema.attributes?.ins, [
      ['className', 'diff-insert'],
    ]),
    span: [['className', /^hljs-/, 'hljs']],
    button: ['type', 'className', 'dataAction', 'ariaLabel'],
    div: extendAttrs(defaultSchema.attributes?.div, [
      'className',
      'dataDiffId',
      'dataDiffType',
      'role',
      'ariaLabel',
    ]),
    '*': extendAttrs(defaultSchema.attributes?.['*'], [
      'dataDiffId',
      'dataDiffType',
      'dataAction',
      'ariaLabel',
    ]),
  },
}
