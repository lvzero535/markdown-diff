<script lang="ts">
import { h, type VNode } from 'vue'
import { diff_match_patch } from 'diff-match-patch'
import { parseMarkdown } from '../utils/markdownParser'

/**
 * MarkdownDiff 组件
 * 
 * 用于对比两个 Markdown 文档差异的 Vue 组件
 * 支持行内文本级差异高亮（删除/插入）
 * 支持块级差异标记（新增块/删除块）
 * 
 * @component
 * @example
 * <MarkdownDiff :old-markdown="oldText" :new-markdown="newText" />
 */
export default {
  props: {
    /**
     * 旧版本的 Markdown 文本
     * @type {string}
     * @required
     */
    oldMarkdown: {
      type: String,
      required: true
    },
    /**
     * 新版本的 Markdown 文本
     * @type {string}
     * @required
     */
    newMarkdown: {
      type: String,
      required: true
    }
  },
  
  render() {
    // 初始化 diff-match-patch 实例，用于计算文本差异
    const dmp = new diff_match_patch()
    
    // 差异类型常量定义
    const DIFF_DELETE = -1  // 删除内容
    const DIFF_INSERT = 1   // 插入内容
    const DIFF_EQUAL = 0    // 相同内容
    
    // 解析 Markdown 为 AST（抽象语法树）
    const oldAst = parseMarkdown(this.oldMarkdown)
    const newAst = parseMarkdown(this.newMarkdown)
    
    /**
     * 递归收集 AST 节点中的所有文本节点
     * @param {any} node - AST 节点
     * @param {string} [path=''] - 当前节点路径（用于定位）
     * @returns {Map<string, string>} - 路径到文本值的映射
     */
    function collectTextNodes(node: any, path: string = ''): Map<string, string> {
      const texts = new Map<string, string>()
      
      /**
       * 递归遍历节点树
       * @param {any} n - 当前节点
       * @param {string} currentPath - 当前路径
       */
      function traverse(n: any, currentPath: string) {
        if (n.type === 'text') {
          texts.set(currentPath, n.value)
        } else if ('children' in n && Array.isArray(n.children)) {
          n.children.forEach((child: any, index: number) => {
            const childPath = currentPath ? `${currentPath}.children.${index}` : `${index}`
            traverse(child, childPath)
          })
        }
      }
      
      traverse(node, path)
      return texts
    }
    
    // 收集新旧 AST 中的所有文本节点
    const oldTexts = collectTextNodes(oldAst)
    const newTexts = collectTextNodes(newAst)
    
    /**
     * 根据路径获取文本内容
     * @param {string} path - 文本节点路径
     * @param {Map<string, string>} texts - 文本映射表
     * @returns {string} - 文本内容，不存在则返回空字符串
     */
    function getTextByPath(path: string, texts: Map<string, string>): string {
      return texts.get(path) || ''
    }
    
    /**
     * 将文本分词为单词、空格和特殊字符
     * @param {string} text - 输入文本
     * @returns {string[]} - 分词结果数组
     */
    function tokenizeText(text: string): string[] {
      const tokens: string[] = []
      const regex = /(\b\w+\b|\s+|[^\w\s])/g
      let match
      while ((match = regex.exec(text)) !== null) {
        tokens.push(match[0])
      }
      return tokens
    }
    
    /**
     * 渲染带有差异标记的文本
     * @param {string} oldText - 旧文本
     * @param {string} newText - 新文本
     * @returns {VNode[]} - 渲染后的 VNode 数组
     */
    function renderDiffText(oldText: string, newText: string): VNode[] {
      const oldTokens = tokenizeText(oldText)
      const newTokens = tokenizeText(newText)
      
      // 使用 diff-match-patch 计算差异，用 \0 分隔 token
      const diffs = dmp.diff_main(oldTokens.join('\0'), newTokens.join('\0'))
      
      return diffs.flatMap((diff: [number, string], index: number) => {
        const [type, text] = diff
        
        if (!text) return []
        
        const tokens = text.split('\0').filter(t => t)
        
        return tokens.map((token, tokenIndex) => {
          switch (type) {
            case DIFF_DELETE:
              return h('del', { key: `${index}-${tokenIndex}`, class: 'diff-delete' }, token)
            case DIFF_INSERT:
              return h('ins', { key: `${index}-${tokenIndex}`, class: 'diff-insert' }, token)
            case DIFF_EQUAL:
            default:
              return h('span', { key: `${index}-${tokenIndex}` }, token)
          }
        })
      })
    }
    
    /**
     * 根据 AST 节点类型渲染对应的 HTML
     * @param {any} node - AST 节点
     * @param {string} [path=''] - 节点路径
     * @returns {VNode | VNode[]} - 渲染后的 VNode
     */
    function renderNode(node: any, path: string = ''): VNode | VNode[] {
      const oldText = getTextByPath(path, oldTexts)
      const newText = getTextByPath(path, newTexts)
      
      switch (node.type) {
        case 'root':
          return node.children?.flatMap((child: any, index: number) => {
            const result = renderNode(child, `${index}`)
            return Array.isArray(result) ? result : [result]
          }) || []
        
        case 'heading': {
          const children = renderChildren(node.children, `${path}.children`)
          return h(`h${node.depth}`, { class: 'markdown-heading' }, children)
        }
        
        case 'paragraph': {
          const children = renderChildren(node.children, `${path}.children`)
          return h('p', { class: 'markdown-paragraph' }, children)
        }
        
        case 'text':
          return renderDiffText(oldText, newText)
        
        case 'strong': {
          const children = renderChildren(node.children, `${path}.children`)
          return h('strong', { class: 'markdown-strong' }, children)
        }
        
        case 'emphasis': {
          const children = renderChildren(node.children, `${path}.children`)
          return h('em', { class: 'markdown-emphasis' }, children)
        }
        
        case 'link': {
          const children = renderChildren(node.children, `${path}.children`)
          return h('a', {
            class: 'markdown-link',
            href: node.url,
            target: '_blank',
            rel: 'noopener noreferrer'
          }, children)
        }
        
        case 'code':
          return h('pre', { class: 'markdown-code-block' }, [h('code', node.value)])
        
        case 'inlineCode':
          return h('code', { class: 'markdown-inline-code' }, node.value)
        
        case 'blockquote': {
          const children = renderChildren(node.children, `${path}.children`)
          return h('blockquote', { class: 'markdown-blockquote' }, children)
        }
        
        case 'list': {
          const children = node.children?.flatMap((child: any, index: number) => {
            const result = renderNode(child, `${path}.children.${index}`)
            return Array.isArray(result) ? result : [result]
          }) || []
          const tag = node.ordered ? 'ol' : 'ul'
          return h(tag, { class: 'markdown-list' }, children)
        }
        
        case 'listItem': {
          const children = renderChildren(node.children, `${path}.children`)
          return h('li', { class: 'markdown-list-item' }, children)
        }
        
        case 'table': {
          const children = node.children?.flatMap((child: any, index: number) => {
            const result = renderNode(child, `${path}.children.${index}`)
            return Array.isArray(result) ? result : [result]
          }) || []
          const headRow = children[0] ? [children[0]] : []
          const bodyRows = children.slice(1)
          return h('table', { class: 'markdown-table' }, [
            h('thead', { class: 'markdown-table-head' }, headRow),
            h('tbody', { class: 'markdown-table-body' }, bodyRows)
          ])
        }
        
        case 'tableRow': {
          const children = node.children?.flatMap((child: any, index: number) => {
            const result = renderNode(child, `${path}.children.${index}`)
            return Array.isArray(result) ? result : [result]
          }) || []
          return h('tr', { class: 'markdown-table-row' }, children)
        }
        
        case 'tableCell': {
          const children = renderChildren(node.children, `${path}.children`)
          const cellType = node.header ? 'th' : 'td'
          return h(cellType, { class: 'markdown-table-cell' }, children)
        }
        
        case 'thematicBreak':
          return h('hr', { class: 'markdown-hr' })
        
        case 'html':
          return h('div', { class: 'markdown-html', innerHTML: node.value })
        
        case 'break':
          return h('br', { class: 'markdown-br' })
        
        default:
          return h('span', {}, `[${node.type}]`)
      }
    }
    
    /**
     * 渲染子节点数组
     * @param {any[]} [children=[]] - 子节点数组
     * @param {string} basePath - 基础路径
     * @returns {VNode[]} - 渲染后的 VNode 数组
     */
    function renderChildren(children: any[] = [], basePath: string): VNode[] {
      return children.flatMap((child: any, index: number) => {
        const result = renderNode(child, `${basePath}.${index}`)
        return Array.isArray(result) ? result : [result]
      })
    }
    
    /**
     * 合并新旧 AST 节点，标记差异类型
     * @param {any} oldAst - 旧 AST
     * @param {any} newAst - 新 AST
     * @returns {any[]} - 合并后的节点数组，包含 diffType 标记
     */
    function mergeAstNodes(oldAst: any, newAst: any): any[] {
      const merged: any[] = []
      const maxLength = Math.max(oldAst.children?.length || 0, newAst.children?.length || 0)
      
      for (let i = 0; i < maxLength; i++) {
        const oldNode = oldAst.children?.[i]
        const newNode = newAst.children?.[i]
        
        if (!oldNode && newNode) {
          merged.push({ ...newNode, diffType: 'add' })
        } else if (oldNode && !newNode) {
          merged.push({ ...oldNode, diffType: 'remove' })
        } else if (oldNode && newNode && oldNode.type === newNode.type) {
          merged.push({ ...newNode, diffType: 'update' })
        } else if (newNode) {
          merged.push(newNode)
        }
      }
      
      return merged
    }
    
    // 合并 AST 节点并标记差异类型
    const mergedNodes = mergeAstNodes(oldAst, newAst)
    
    // 渲染最终的差异结果
    const renderedDiff: VNode[] = mergedNodes.flatMap((node: any, index: number) => {
      const result = renderNode(node, `${index}`)
      const resultArray = Array.isArray(result) ? result : [result]
      
      if (node.diffType === 'add') {
        return [h('div', { class: 'diff-block-add' }, resultArray)]
      } else if (node.diffType === 'remove') {
        return [h('div', { class: 'diff-block-remove' }, resultArray)]
      }
      return resultArray
    })
    
    // 返回最终渲染结果
    return h('div', { class: 'markdown-diff-container' }, [
      h('div', { class: 'markdown-diff-content' }, renderedDiff)
    ])
  }
}
</script>

<style>
.markdown-diff-container {
  padding: 20px;
  background: #ffffff;
  border-radius: 8px;
}

.markdown-diff-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
}

.diff-delete {
  background-color: #fecaca;
  color: #dc2626;
  text-decoration: line-through;
  padding: 1px 3px;
  border-radius: 2px;
}

.diff-insert {
  background-color: #bbf7d0;
  color: #059669;
  text-decoration: none;
  padding: 1px 3px;
  border-radius: 2px;
}

.markdown-heading {
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #e5e7eb;
}

h1.markdown-heading {
  font-size: 2em;
  margin-top: 0;
}

h2.markdown-heading {
  font-size: 1.5em;
}

h3.markdown-heading {
  font-size: 1.25em;
}

.markdown-paragraph {
  margin: 1em 0;
}

.markdown-strong {
  font-weight: 600;
}

.markdown-emphasis {
  font-style: italic;
}

.markdown-link {
  color: #3b82f6;
  text-decoration: none;
}

.markdown-link:hover {
  text-decoration: underline;
}

.markdown-code-block {
  background-color: #f3f4f6;
  padding: 1em;
  border-radius: 4px;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
  overflow-x: auto;
}

.markdown-inline-code {
  background-color: #f3f4f6;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
}

.markdown-blockquote {
  border-left: 4px solid #e5e7eb;
  padding-left: 1em;
  margin: 1em 0;
  color: #6b7280;
}

.markdown-list {
  padding-left: 2em;
  margin: 1em 0;
}

.markdown-list-item {
  margin: 0.25em 0;
}

.markdown-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 14px;
}

.markdown-table-head {
  background-color: #f3f4f6;
}

.markdown-table-body {
  background-color: #ffffff;
}

.markdown-table-cell {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  text-align: left;
}

.markdown-table-row:nth-child(even) {
  background-color: #f9fafb;
}

.markdown-hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 2em 0;
}

.diff-block-add {
  background-color: rgba(16, 185, 129, 0.1);
  border-left: 3px solid #10b981;
  padding: 12px;
  margin: 8px 0;
  border-radius: 0 4px 4px 0;
}

.diff-block-remove {
  background-color: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
  padding: 12px;
  margin: 8px 0;
  border-radius: 0 4px 4px 0;
}
</style>
