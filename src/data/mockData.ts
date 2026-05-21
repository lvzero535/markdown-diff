/**
 * Diff 演示场景：覆盖块级 LCS、行内/字符 diff、表格列映射、子级 hunk 等能力。
 * 名称前会自动加序号（见文件末尾 map）。
 */
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
    name: '表格：表头列名+单元格内容同时变更',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |`,
    newMarkdown: `| Name  | Grade |\n|-------|-------|\n| Alice | A     |`,
  },
  {
    name: '表格：表头模糊重命名（Score→Points，数据仍为数字）',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
    newMarkdown: `| Name  | Points |\n|--------|--------|\n| Alice | 85     |\n| Bob   | 92     |`,
  },
  {
    name: '表格：列顺序调整（重排，易触发回退配对）',
    oldMarkdown: `| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |`,
    newMarkdown: `| C | A | B |\n|---|---|---|\n| 3 | 1 | 2 |`,
  },
  {
    name: '表格：新增列',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |`,
  },
  {
    name: '表格：删除列',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
  },
  {
    name: '表格：新增列+删除行',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |`,
  },
  {
    name: '表格：删除列+新增行',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |`,
  },
  {
    name: '表格：整表新增',
    oldMarkdown: `Below is the summary.\n\nEnd of report.`,
    newMarkdown: `Below is the summary.\n\n| Region | Revenue |\n|--------|---------|\n| North  | $1.2M   |\n| South  | $0.8M   |\n\nEnd of report.`,
  },
  {
    name: '表格：整表删除',
    oldMarkdown: `Below is the summary.\n\n| Region | Revenue |\n|--------|---------|\n| North  | $1.2M   |\n| South  | $0.8M   |\n\nEnd of report.`,
    newMarkdown: `Below is the summary.\n\nEnd of report.`,
  },
  {
    name: '表格：多行同时修改',
    oldMarkdown: `| Item   | Price |\n|--------|-------|\n| Apple  | $1.00 |\n| Banana | $0.50 |\n| Cherry | $3.00 |`,
    newMarkdown: `| Item   | Price |\n|--------|-------|\n| Apple  | $1.20 |\n| Banana | $0.60 |\n| Cherry | $3.50 |`,
  },
  {
    name: '表格：表头+数据同时变',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |`,
    newMarkdown: `| Player | Points |\n|--------|--------|\n| Alice  | 95     |\n| Bob    | 88     |`,
  },
  {
    name: '表格：中间删除行+新增列',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Carol | 78    | C     |\n| Dave  | 88    | B     |`,
  },
  {
    name: '表格：中间新增行+删除列',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |\n| Dave  | 88    | B     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
  },
  {
    name: '表格：中间删除行',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Carol | 78    |\n| Dave  | 88    |`,
  },
  {
    name: '表格：中间新增行',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
  },
  {
    name: '表格：中间删除行+删除列',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |\n| Carol | 78    | C     |\n| Dave  | 88    | B     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Carol | 78    |\n| Dave  | 88    |`,
  },
  {
    name: '表格：中间新增行+新增列',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |\n| Carol | 78    | C     |\n| Dave  | 88    | B     |`,
  },
  {
    name: '表格：新增列+删除行+单元格修改',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 95    | A     |\n| Carol | 78    | C     |\n| Dave  | 90    | B     |`,
  },
  {
    name: '表格：删除列+新增行+单元格修改',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |\n| Carol | 78    | C     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 95    |\n| Bob   | 92    |\n| Carol | 80    |\n| Dave  | 88    |`,
  },
  {
    name: '表格：新增列+单元格修改',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 95    | A     |\n| Bob   | 92    | B+    |\n| Carol | 78    | C     |`,
  },
  {
    name: '表格：删除列+单元格修改',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |\n| Carol | 78    | C     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 95    |\n| Bob   | 92    |\n| Carol | 80    |`,
  },
  {
    name: '表格：中间删除行+新增列+单元格修改',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 90    | A     |\n| Carol | 80    | B     |\n| Dave  | 88    | B+    |`,
  },
  {
    name: '表格：中间新增行+删除列+单元格修改',
    oldMarkdown: `| Name  | Score | Grade |\n|-------|-------|-------|\n| Alice | 85    | B+    |\n| Bob   | 92    | A     |\n| Dave  | 88    | B     |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 90    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 85    |`,
  },
  {
    name: '表格：多单元格修改+表头修改',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |`,
    newMarkdown: `| Name  | Grade |\n|-------|-------|\n| Alice | A     |\n| Bob   | B+    |\n| Carol | C     |`,
  },
  {
    name: '表格：删除中间列+新增中间行',
    oldMarkdown: `| Name  | Dept  | Score |\n|-------|-------|-------|\n| Alice | Eng   | 85    |\n| Bob   | Sales | 92    |\n| Carol | HR    | 78    |\n| Dave  | IT    | 88    |`,
    newMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Eric  | 95    |\n| Dave  | 88    |`,
  },
  {
    name: '表格：新增中间列',
    oldMarkdown: `| Name  | Score |\n|-------|-------|\n| Alice | 85    |\n| Bob   | 92    |\n| Carol | 78    |\n| Dave  | 88    |`,
    newMarkdown: `| Name  | Dept  | Score |\n|-------|-------|-------|\n| Alice | Eng   | 85    |\n| Bob   | Sales | 92    |\n| Carol | HR    | 78    |\n| Dave  | IT    | 88    |`,
  },

  // ==================== 列表 ====================
  {
    name: '列表：无序列表新增项',
    oldMarkdown: `- Apple\n- Banana\n- Cherry`,
    newMarkdown: `- Apple\n- Banana\n- Date\n- Cherry`,
  },
  {
    name: '列表：无序列表删除中间项（Banana）',
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
    name: '列表：有序列表修改项文本',
    oldMarkdown: `1. Install dependencies\n2. Run the dev server\n3. Open the browser`,
    newMarkdown: `1. Install dependencies\n2. Run the production build\n3. Open the browser`,
  },
  {
    name: '列表：GFM 任务列表（勾选状态变化）',
    oldMarkdown: `- [ ] Write tests\n- [x] Implement feature\n- [ ] Deploy`,
    newMarkdown: `- [x] Write tests\n- [x] Implement feature\n- [ ] Deploy to staging`,
  },
  {
    name: '列表：GFM 任务列表（新增/删除项）',
    oldMarkdown: `- [x] Done task\n- [ ] Pending task`,
    newMarkdown: `- [x] Done task\n- [ ] Pending task\n- [ ] New task`,
  },
  {
    name: '列表：无序↔有序切换（整块替换）',
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
    oldMarkdown: `![Logo](https://example.com/assets/logo-v1.png)\n\nWelcome to our site.`,
    newMarkdown: `![Logo](https://example.com/assets/logo-v2.png)\n\nWelcome to our site.`,
  },
  {
    name: '图片：alt文本变化',
    oldMarkdown: `![Old description](https://example.com/assets/diagram.png)\n\nText below.`,
    newMarkdown: `![New description](https://example.com/assets/diagram.png)\n\nText below.`,
  },
  {
    name: '图片：新增',
    oldMarkdown: `Here is the architecture overview.`,
    newMarkdown: `Here is the architecture overview.\n\n![Architecture](https://example.com/assets/architecture.png)`,
  },
  {
    name: '图片：删除',
    oldMarkdown: `![Screenshot](https://example.com/assets/screenshot.png)\n\nThe interface shown above.`,
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
    name: 'HTML：原始标签 class 变化（经 sanitize 后输出）',
    oldMarkdown: `<div class="old-class">Content here</div>\n\nRegular paragraph.`,
    newMarkdown: `<div class="new-class">Content here</div>\n\nRegular paragraph.`,
  },
  {
    name: 'HTML：自动链接 URL 变化',
    oldMarkdown: `Visit https://docs.example.com/v1 for details.`,
    newMarkdown: `Visit https://docs.example.com/v2 for details.`,
  },

  // ==================== 块级结构 ====================
  {
    name: '块级：段落顺序对调',
    oldMarkdown: `First paragraph.\n\nSecond paragraph.\n\nThird paragraph.`,
    newMarkdown: `Second paragraph.\n\nFirst paragraph.\n\nThird paragraph.`,
  },
  {
    name: '块级：中间插入新段落',
    oldMarkdown: `Introduction.\n\nConclusion.`,
    newMarkdown: `Introduction.\n\nBody with details.\n\nConclusion.`,
  },
  {
    name: '块级：相似段落并存（LCS 相似度匹配）',
    oldMarkdown: `The system processes user requests quickly.\n\nThe system handles admin requests quickly.\n\nUnrelated footer text.`,
    newMarkdown: `The system processes user requests quickly.\n\nThe system handles admin requests efficiently.\n\nUnrelated footer text.`,
  },
  {
    name: '块级：整块删除+整块新增相邻',
    oldMarkdown: `Keep this.\n\n# Old Section\n\nRemove me.\n\nKeep end.`,
    newMarkdown: `Keep this.\n\n## New Section\n\nFresh content.\n\nKeep end.`,
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
    name: '边界：多余空行（块级结构差异）',
    oldMarkdown: `Line one.\n\nLine two.`,
    newMarkdown: `Line one.\n\n\nLine two.`,
  },
  {
    name: '边界：行尾两空格硬换行（GFM）',
    oldMarkdown: `Line one  \ncontinues.\n\nStable paragraph.`,
    newMarkdown: `Line one\ncontinues.\n\nStable paragraph.`,
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
    name: '混合：段落内链接+加粗同时变更',
    oldMarkdown: `See the [**old guide**](https://docs.example.com/v1) for setup.`,
    newMarkdown: `See the [new **guide**](https://docs.example.com/v2) for setup.`,
  },
  {
    name: '混合：表格单元格内含行内格式',
    oldMarkdown: `| Feature | Status |\n|---------|--------|\n| Auth | **Done** |\n| API | WIP |`,
    newMarkdown: `| Feature | Status |\n|---------|--------|\n| Auth | **Done** |\n| API | *Beta* |`,
  },
  {
    name: '混合：多种差异组合',
    oldMarkdown: `# Project Status\n\nThe **current** version is 1.0.\n\n- Feature A\n- Feature B\n\n\`\`\`javascript\nconst v = "1.0";\n\`\`\`\n\n> Note: this is stable.\n\n| Status | Date |\n|--------|------|\n| Active | 2024 |`,
    newMarkdown: `## Project Status\n\nThe **updated** version is 2.0.\n\nWe have made significant progress.\n\n- Feature A\n- Feature B\n- Feature C\n\n\`\`\`javascript\nconst v = "2.0";\n\`\`\`\n\n\`\`\`python\nv = "2.0"\n\`\`\`\n\n> Note: this is stable and production-ready.\n\n| Status | Date |\n|--------|------|\n| Active | 2025 |`,
  },

  // ==================== 交互向（子级 hunk / 接受拒绝） ====================
  {
    name: '交互：表格仅新增一列（可点列级接受/拒绝）',
    oldMarkdown: `| Name | Value |\n|------|-------|\n| Foo  | 10    |`,
    newMarkdown: `| Name | Value | Note |\n|------|-------|------|\n| Foo  | 10    | ok   |`,
  },
  {
    name: '交互：列表仅新增一项（可点 listItem 接受/拒绝）',
    oldMarkdown: `- Alpha\n- Beta`,
    newMarkdown: `- Alpha\n- Beta\n- Gamma`,
  },

  // ==================== 综合演示 ====================
  {
    name: '综合：Quarterly Sales Report（拼写+格式+表格+代码）',
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

/** 全部演示场景（名称已加 `01.` 序号前缀） */
export const scenarios: DiffScenario[] = _scenarios.map((s, i) => ({
  ...s,
  name: `${String(i + 1).padStart(2, '0')}. ${s.name}`,
}))

/** 场景数量，便于测试与 UI 展示 */
export const scenarioCount = scenarios.length

export const oldMarkdown = scenarios[scenarios.length - 1].oldMarkdown
export const newMarkdown = scenarios[scenarios.length - 1].newMarkdown
