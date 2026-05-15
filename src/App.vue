<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownDiff from './components/MarkdownDiff.vue'
import JsonViewer from 'vue-json-viewer'
import { oldMarkdown as defaultOldMarkdown, newMarkdown as defaultNewMarkdown } from './data/mockData'
import { parseMarkdown } from './utils/markdownParser'

const oldMarkdown = ref(defaultOldMarkdown)
const newMarkdown = ref(defaultNewMarkdown)

const oldAst = computed(() => parseMarkdown(oldMarkdown.value))
const newAst = computed(() => parseMarkdown(newMarkdown.value))
</script>

<template>
  <!-- 主应用容器，包含渐变背景 -->
  <div class="app-container">
    <!-- 页面头部：展示应用标题和描述 -->
    <header class="header">
      <h1>Markdown AST Diff</h1>
      <p>Compare markdown documents with inline text-level diff</p>
    </header>

    <!-- 主内容区域 -->
    <main class="main-content">
      <!-- Markdown 编辑器区域：左右双栏布局，分别输入新旧 Markdown -->
      <div class="editor-section">
        <!-- 旧 Markdown 编辑器 -->
        <div class="editor">
          <div class="editor-header">
            <span class="label">Old Markdown</span>
          </div>
          <textarea
            v-model="oldMarkdown"
            class="editor-textarea"
            placeholder="Enter old markdown..."
          ></textarea>
        </div>

        <!-- 新 Markdown 编辑器 -->
        <div class="editor">
          <div class="editor-header">
            <span class="label">New Markdown</span>
          </div>
          <textarea
            v-model="newMarkdown"
            class="editor-textarea"
            placeholder="Enter new markdown..."
          ></textarea>
        </div>
      </div>

      <!-- Diff 渲染结果区域 -->
      <div class="diff-section">
        <div class="result-card">
          <div class="result-header">
            <span class="label">Rendered Diff Result</span>
          </div>
          <!-- MarkdownDiff 组件：核心差异对比展示，支持行内文本级差异高亮 -->
          <MarkdownDiff :old-markdown="oldMarkdown" :new-markdown="newMarkdown" />
        </div>
      </div>

      <!-- AST 可视化区域：展示解析后的抽象语法树结构 -->
      <div class="ast-section">
        <!-- 旧 Markdown 的 AST 结构 -->
        <div class="result-card ast-card">
          <div class="result-header">
            <span class="label">Old AST</span>
          </div>
          <!-- JsonViewer：格式化展示 AST JSON 结构，默认展开2层深度 -->
          <JsonViewer :value="oldAst" :expand-depth="2" class="json-viewer" />
        </div>

        <!-- 新 Markdown 的 AST 结构 -->
        <div class="result-card ast-card">
          <div class="result-header">
            <span class="label">New AST</span>
          </div>
          <JsonViewer :value="newAst" :expand-depth="2" class="json-viewer" />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.header {
  text-align: center;
  color: white;
  margin-bottom: 30px;
}

.header h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.header p {
  font-size: 1.1rem;
  opacity: 0.9;
}

.main-content {
  max-width: 1400px;
  margin: 0 auto;
}

.editor-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.editor {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.editor-header {
  background: #f5f5f5;
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.label {
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

.editor-textarea {
  width: 100%;
  height: 250px;
  padding: 20px;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
  border: none;
  resize: none;
  outline: none;
  background: #fafafa;
}

.diff-section {
  margin-bottom: 20px;
}

.ast-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.result-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.ast-card {
  max-height: 500px;
  overflow-y: auto;
}

.result-header {
  background: #f5f5f5;
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
  position: sticky;
  top: 0;
}

.json-viewer {
  padding: 20px;
}

@media (max-width: 768px) {
  .editor-section {
    grid-template-columns: 1fr;
  }

  .ast-section {
    grid-template-columns: 1fr;
  }

  .header h1 {
    font-size: 1.8rem;
  }
}
</style>
