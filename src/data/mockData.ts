export type DiffScenario = {
  name: string
  oldMarkdown: string
  newMarkdown: string
}

const _scenarios: DiffScenario[] = [
  // ==================== 标题 ====================
  {
    name: '标题：文本修改（同级别）',
    oldMarkdown: `# Getting Started\n\nThis is a guide.`,
    newMarkdown: `# Getting Started Guide\n\nThis is a guide.`,
  },
  {
    name: '标题：级别变化 h1→h2',
    oldMarkdown: `# Main Title\n\nContent here.`,
    newMarkdown: `## Main Title\n\nContent here.`,
  },
  {
    name: '标题：带格式变化 **bold**→plain',
    oldMarkdown: `# **Important** Update\n\nDetails follow.`,
    newMarkdown: `# Important Update\n\nDetails follow.`,
  },
  {
    name: '标题：新增标题',
    oldMarkdown: `First paragraph here.\n\nSecond paragraph.`,
    newMarkdown: `# New Heading\n\nFirst paragraph here.\n\nSecond paragraph.`,
  },
  {
    name: '标题：删除标题',
    oldMarkdown: `# Removed Heading\n\nFirst paragraph.\n\nSecond paragraph.`,
    newMarkdown: `First paragraph.\n\nSecond paragraph.`,
  },

  // ==================== 段落 ====================
  {
    name: '段落：文本修改（词级diff）',
    oldMarkdown: `The quick brown fox jumps over the lazy dog.`,
    newMarkdown: `The quick brown fox leaps over the sleepy dog.`,
  },
  {
    name: '段落：新增段落',
    oldMarkdown: `First paragraph.\n\nThird paragraph.`,
    newMarkdown: `First paragraph.\n\nSecond paragraph inserted.\n\nThird paragraph.`,
  },
  {
    name: '段落：删除段落',
    oldMarkdown: `First paragraph.\n\nDeleted paragraph.\n\nThird paragraph.`,
    newMarkdown: `First paragraph.\n\nThird paragraph.`,
  },
  {
    name: '段落：拆分（一段→两段）',
    oldMarkdown: `This is a long paragraph that contains two ideas. The second idea starts here.`,
    newMarkdown: `This is a long paragraph that contains two ideas.\n\nThe second idea starts here.`,
  },
  {
    name: '段落：合并（两段→一段）',
    oldMarkdown: `First part of the sentence.\n\nSecond part continues here.`,
    newMarkdown: `First part of the sentence. Second part continues here.`,
  },

  // ==================== 加粗 ====================
  {
    name: '加粗：添加 **bold**',
    oldMarkdown: `This is important information.`,
    newMarkdown: `This is **important** information.`,
  },
  {
    name: '加粗：移除 **bold**',
    oldMarkdown: `This is **important** information.`,
    newMarkdown: `This is important information.`,
  },
  {
    name: '加粗：切换为斜体 **bold**→*italic*',
    oldMarkdown: `This is **important** information.`,
    newMarkdown: `This is *important* information.`,
  },

  // ==================== 斜体 ====================
  {
    name: '斜体：添加 *italic*',
    oldMarkdown: `Use caution when proceeding.`,
    newMarkdown: `Use *caution* when proceeding.`,
  },
  {
    name: '斜体：移除 *italic*',
    oldMarkdown: `Use *caution* when proceeding.`,
    newMarkdown: `Use caution when proceeding.`,
  },
  {
    name: '斜体：切换为加粗 *italic*→**bold**',
    oldMarkdown: `This is *emphasized* text.`,
    newMarkdown: `This is **emphasized** text.`,
  },

  // ==================== 删除线 ====================
  {
    name: '删除线：添加 ~~strikethrough~~',
    oldMarkdown: `This task is pending review.`,
    newMarkdown: `This task is ~~pending~~ under review.`,
  },
  {
    name: '删除线：移除 ~~strikethrough~~',
    oldMarkdown: `This is ~~deprecated~~ current functionality.`,
    newMarkdown: `This is current functionality.`,
  },

  // ==================== 行内代码 ====================
  {
    name: '行内代码：添加 `code`',
    oldMarkdown: `Use the print function to output text.`,
    newMarkdown: `Use the \`print\` function to output text.`,
  },
  {
    name: '行内代码：移除 `code`',
    oldMarkdown: `Run \`npm install\` to setup the project.`,
    newMarkdown: `Run npm install to setup the project.`,
  },
  {
    name: '行内代码：内容修改（字符级diff）',
    oldMarkdown: `Use \`console.logg\` for debugging.`,
    newMarkdown: `Use \`console.log\` for debugging.`,
  },

  // ==================== 代码块 ====================
  {
    name: '代码块：内容修改（字符级diff）',
    oldMarkdown: `\`\`\`javascript\nfunction greet(name) {\n  return "Hello " + name;\n}\n\`\`\``,
    newMarkdown: `\`\`\`javascript\nfunction greet(name) {\n  return "Hello, " + name + "!";\n}\n\`\`\``,
  },
  {
    name: '代码块：语言标签变化',
    oldMarkdown: `\`\`\`javascript\nconst x = 1;\n\`\`\``,
    newMarkdown: `\`\`\`typescript\nconst x = 1;\n\`\`\``,
  },
  {
    name: '代码块：新增',
    oldMarkdown: `Here is the algorithm explanation.\n\nThat is all.`,
    newMarkdown: `Here is the algorithm explanation.\n\n\`\`\`python\ndef sort(arr):\n    return sorted(arr)\n\`\`\`\n\nThat is all.`,
  },
  {
    name: '代码块：删除',
    oldMarkdown: `Here is the algorithm.\n\n\`\`\`python\ndef sort(arr):\n    return sorted(arr)\n\`\`\`\n\nThat is all.`,
    newMarkdown: `Here is the algorithm.\n\nThat is all.`,
  },
  {
    name: '代码块：多个不同lang代码块（自动匹配lang）',
    oldMarkdown: `\`\`\`javascript\nconsole.log("hello");\n\`\`\`\n\nSome text.\n\n\`\`\`python\nprint("world")\n\`\`\``,
    newMarkdown: `\`\`\`javascript\nconsole.log("hello world");\n\`\`\`\n\nSome text.\n\n\`\`\`python\nprint("hello world")\n\`\`\``,
  },
  {
    name: '代码块：多个相同lang代码块（LCS匹配）',
    oldMarkdown: `\`\`\`javascript\nconst a = 1;\n\`\`\`\n\nMiddle text.\n\n\`\`\`javascript\nconst b = 2;\n\`\`\``,
    newMarkdown: `\`\`\`javascript\nconst a = 10;\n\`\`\`\n\nMiddle text.\n\n\`\`\`javascript\nconst b = 20;\n\`\`\``,
  },

  // ==================== 表格 ====================
  {
    name: '表格：单元格修改',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 95    |\n| Bob   | 92    |`,
  },
  {
    name: '表格：新增行',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
  },
  {
    name: '表格：删除行',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |`,
  },
  {
    name: '表格：表头修改',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |`,
    newMarkdown: `| Name  | Grade |\n|-------|-------|\n| Alice | A     |`,
  },

  // ==================== 列表 ====================
  {
    name: '列表：无序列表新增项',
    oldMarkdown: `- Apple\n- Banana\n- Cherry`,
    newMarkdown: `- Apple\n- Banana\n- Date\n- Cherry`,
  },
  {
    name: '列表：无序列表删除项',
    oldMarkdown: `- Apple\n- Banana\n- Cherry\n- Date`,
    newMarkdown: `- Apple\n- Cherry\n- Date`,
  },
  {
    name: '列表：无序列表修改项',
    oldMarkdown: `- First item\n- Second item\n- Third item`,
    newMarkdown: `- First item\n- Updated second item\n- Third item`,
  },
  {
    name: '列表：有序列表新增项',
    oldMarkdown: `1. Step one\n2. Step two\n3. Step three`,
    newMarkdown: `1. Step one\n2. Step one-b\n3. Step two\n4. Step three`,
  },
  {
    name: '列表：有序列表删除项',
    oldMarkdown: `1. Step one\n2. Step two\n3. Step three`,
    newMarkdown: `1. Step one\n2. Step three`,
  },
  {
    name: '列表：有序↔无序切换',
    oldMarkdown: `- Apple\n- Banana\n- Cherry`,
    newMarkdown: `1. Apple\n2. Banana\n3. Cherry`,
  },
  {
    name: '列表：嵌套列表变化',
    oldMarkdown: `- Fruits\n  - Apple\n  - Banana\n- Vegetables\n  - Carrot`,
    newMarkdown: `- Fruits\n  - Apple\n  - Banana\n  - Cherry\n- Vegetables\n  - Carrot\n  - Broccoli`,
  },

  // ==================== 链接 ====================
  {
    name: '链接：URL变化',
    oldMarkdown: `Visit [our website](https://old.example.com) for details.`,
    newMarkdown: `Visit [our website](https://new.example.com) for details.`,
  },
  {
    name: '链接：文本变化',
    oldMarkdown: `Check [the documentation](https://example.com) here.`,
    newMarkdown: `Check [the API reference](https://example.com) here.`,
  },
  {
    name: '链接：新增',
    oldMarkdown: `Learn more about our product.`,
    newMarkdown: `Learn more about [our product](https://example.com).`,
  },
  {
    name: '链接：删除',
    oldMarkdown: `Check [the docs](https://example.com) for details.`,
    newMarkdown: `Check the docs for details.`,
  },

  // ==================== 图片 ====================
  {
    name: '图片：URL变化',
    oldMarkdown: `![Logo](https://fastly.picsum.photos/id/755/200/200.jpg?hmac=fgsDUz8GLl3UPtHhHlMIabU9V8LhbOPCwYGzrrn6CyU)\n\nWelcome to our site.`,
    newMarkdown: `![Logo](https://fastly.picsum.photos/id/248/300/200.jpg?hmac=MgP74ne6TDOEKvULUnvYUQoxaFF8mtIkmzlBu-rIBL8)\n\nWelcome to our site.`,
  },
  {
    name: '图片：alt文本变化',
    oldMarkdown: `![Old description](https://fastly.picsum.photos/id/248/300/200.jpg?hmac=MgP74ne6TDOEKvULUnvYUQoxaFF8mtIkmzlBu-rIBL8)\n\nText below.`,
    newMarkdown: `![New description](https://fastly.picsum.photos/id/248/300/200.jpg?hmac=MgP74ne6TDOEKvULUnvYUQoxaFF8mtIkmzlBu-rIBL8)\n\nText below.`,
  },
  {
    name: '图片：新增',
    oldMarkdown: `Here is the architecture overview.`,
    newMarkdown: `Here is the architecture overview.\n\n![Architecture](https://fastly.picsum.photos/id/248/300/200.jpg?hmac=MgP74ne6TDOEKvULUnvYUQoxaFF8mtIkmzlBu-rIBL8)`,
  },
  {
    name: '图片：删除',
    oldMarkdown: `![Screenshot](https://fastly.picsum.photos/id/248/300/200.jpg?hmac=MgP74ne6TDOEKvULUnvYUQoxaFF8mtIkmzlBu-rIBL8)\n\nThe interface shown above.`,
    newMarkdown: `The interface shown above.`,
  },

  // ==================== 引用块 ====================
  {
    name: '引用块：内容修改',
    oldMarkdown: `> This is an important note about the system.\n\nEnd of section.`,
    newMarkdown: `> This is a critical note about the system.\n\nEnd of section.`,
  },
  {
    name: '引用块：新增',
    oldMarkdown: `Please review the changes carefully.\n\nProceed with caution.`,
    newMarkdown: `Please review the changes carefully.\n\n> **Warning**: This is a breaking change.\n\nProceed with caution.`,
  },
  {
    name: '引用块：删除',
    oldMarkdown: `> This note is no longer relevant.\n\nMain content here.`,
    newMarkdown: `Main content here.`,
  },
  {
    name: '引用块：嵌套引用变化',
    oldMarkdown: `> Level one\n> > Level two\n> > > Level three`,
    newMarkdown: `> Level one updated\n> > Level two\n> > > Level three updated`,
  },

  // ==================== 分隔线 ====================
  {
    name: '分隔线：新增',
    oldMarkdown: `First section.\n\nSecond section.`,
    newMarkdown: `First section.\n\n---\n\nSecond section.`,
  },
  {
    name: '分隔线：删除',
    oldMarkdown: `First section.\n\n---\n\nSecond section.`,
    newMarkdown: `First section.\n\nSecond section.`,
  },

  // ==================== HTML 原始内容 ====================
  {
    name: 'HTML：原始标签变化',
    oldMarkdown: `<div class="old-class">Content here</div>\n\nRegular paragraph.`,
    newMarkdown: `<div class="new-class">Content here</div>\n\nRegular paragraph.`,
  },

  // ==================== 边界场景 ====================
  {
    name: '边界：空文档→有内容',
    oldMarkdown: ``,
    newMarkdown: `# Hello World\n\nThis is new content.\n\n- Item one\n- Item two`,
  },
  {
    name: '边界：有内容→空文档',
    oldMarkdown: `# Goodbye\n\nThis content will be removed.\n\n- Item one\n- Item two`,
    newMarkdown: ``,
  },
  {
    name: '边界：完全相同的文档',
    oldMarkdown: `# No Changes\n\nThis document is identical on both sides.\n\n- Same item`,
    newMarkdown: `# No Changes\n\nThis document is identical on both sides.\n\n- Same item`,
  },
  {
    name: '边界：完全不同的文档',
    oldMarkdown: `# Old Document\n\nThis is about the old system.\n\n\`\`\`python\nprint("old")\n\`\`\``,
    newMarkdown: `## New Article\n\nCompletely different topic here.\n\n| A | B |\n|---|---|\n| 1 | 2 |`,
  },
  {
    name: '边界：仅空白变化',
    oldMarkdown: `Hello   world.\n\nNext   paragraph.`,
    newMarkdown: `Hello world.\n\nNext paragraph.`,
  },

  // ==================== 混合格式 ====================
  {
    name: '混合：单段落多格式变化',
    oldMarkdown: `Use **bold** and *italic* with \`code\` and [link](https://example.com).`,
    newMarkdown: `Use **strong** and *emphasis* with \`inline\` and [url](https://new.com).`,
  },
  {
    name: '混合：inline结构退化（纯文本→加粗）',
    oldMarkdown: `The highlight of the show was the finale.`,
    newMarkdown: `The **highlight** of the show was the finale.`,
  },
  {
    name: '混合：inline结构退化（加粗→纯文本）',
    oldMarkdown: `The **highlight** of the show was the finale.`,
    newMarkdown: `The highlight of the show was the finale.`,
  },
  {
    name: '混合：嵌套格式 ***bold+italic***',
    oldMarkdown: `This is ***really important*** information.`,
    newMarkdown: `This is **really important** information.`,
  },
  {
    name: '混合：多种差异组合',
    oldMarkdown: `# Project Status\n\nThe **current** version is 1.0.\n\n- Feature A\n- Feature B\n\n\`\`\`javascript\nconst v = "1.0";\n\`\`\`\n\n> Note: this is stable.\n\n| Status | Date |\n|--------|------|\n| Active | 2024 |`,
    newMarkdown: `## Project Status\n\nThe **updated** version is 2.0.\n\nWe have made significant progress.\n\n- Feature A\n- Feature B\n- Feature C\n\n\`\`\`javascript\nconst v = "2.0";\n\`\`\`\n\n\`\`\`python\nv = "2.0"\n\`\`\`\n\n> Note: this is stable and production-ready.\n\n| Status | Date |\n|--------|------|\n| Active | 2025 |`,
  },

  // ==================== 原始默认场景 ====================
  {
    name: '默认：Quarterly Sales Report',
    oldMarkdown: `# Quarterly Sales Repost

Looking ahead, the Q4 forecast projects a **continued** upward trend for the business.

Our product mix still favors enterprise contracts, while smaller self-serve plans are growing steadily.

\`\`\`javascript
function calculateRevenue(sales) {
  return sales.reduce((sum, item) => sum + item.amount, 0);
}
\`\`\`

| Region | Revenue | Growth |
|--------|---------|--------|
| North America | $1,250,000 | +2.1% |
| Europe | $980,000 | +1.4% |
| Asia | $720,000 | +9.8% |

The marketing team should focus on sustaining growth.`,
    newMarkdown: `# Quarterly Sales Report

Looking ahead, the Q4 forecast projects a continued upward trend for the business.

Our product mix still favors enterprise contracts, while smaller self-serve plans are growing very steadily.

We also added regional expansion plans for Asia-Pacific.

\`\`\`javascript
function calculateRevenue(sales) {
  const tax = 0.08;
  return sales.reduce((sum, item) => sum + item.amount * (1 + tax), 0);
}
\`\`\`

\`\`\`python
def calculate_revenue(sales):
    return sum(item['amount'] for item in sales)
\`\`\`

| Region | Revenue | Growth |
|--------|---------|--------|
| North America | $1,310,000 | +4.8% |
| Europe | $1,150,000 | +17.3% |
| Asia | $870,000 | +20.8% |

The marketing team should focus on sustaining growth in Asia and Europe.`,
  },
]

export const scenarios: DiffScenario[] = _scenarios.map((s, i) => ({
  ...s,
  name: `${String(i + 1).padStart(2, '0')}. ${s.name}`,
}))

export const oldMarkdown = scenarios[scenarios.length - 1].oldMarkdown
export const newMarkdown = scenarios[scenarios.length - 1].newMarkdown
