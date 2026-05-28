<script setup lang="ts">
import { ref, watch, provide } from 'vue'
import MarkdownDiff from './components/markdownDiff/MarkdownDiff.vue'
import JsonViewer from 'vue-json-viewer'
import { scenarios } from './data/mockData'
import { useMarkdownDiff, markdownDiffKey } from './components/markdownDiff'
import { parseMarkdown } from './components/markdownDiff'

const selectedScenarioIndex = ref(scenarios.length - 1)
const oldMarkdown = ref(scenarios[selectedScenarioIndex.value].oldMarkdown)
const newMarkdown = ref(scenarios[selectedScenarioIndex.value].newMarkdown)

watch(selectedScenarioIndex, (idx) => {
  oldMarkdown.value = scenarios[idx].oldMarkdown
  newMarkdown.value = scenarios[idx].newMarkdown
})

const diffApi = useMarkdownDiff(
  () => oldMarkdown.value,
  () => newMarkdown.value
)
provide(markdownDiffKey, diffApi)

const { workingMdast, finalMarkdown } = diffApi
const oldAstPreview = () => parseMarkdown(oldMarkdown.value)
const newAstPreview = () => parseMarkdown(newMarkdown.value)
</script>

<template>
  <div class="app-container">
    <header class="header">
      <h1>Markdown AST Diff</h1>
      <p>Compare markdown documents with inline text-level diff</p>
    </header>

    <main class="main-content">
      <div class="scenario-selector">
        <label for="scenario-select" class="label">切换场景：</label>
        <select id="scenario-select" v-model.number="selectedScenarioIndex" class="scenario-select">
          <option v-for="(scenario, index) in scenarios" :key="index" :value="index">
            {{ scenario.name }}
          </option>
        </select>
        <span class="scenario-count">{{ selectedScenarioIndex + 1 }} / {{ scenarios.length }}</span>
      </div>

      <div class="editor-section editor-section--triple">
        <div class="editor">
          <div class="editor-header">
            <span class="label">Old Markdown（只读输入）</span>
          </div>
          <textarea
            v-model="oldMarkdown"
            class="editor-textarea"
            placeholder="Enter old markdown..."
          />
        </div>

        <div class="editor">
          <div class="editor-header">
            <span class="label">New Markdown（只读输入）</span>
          </div>
          <textarea
            v-model="newMarkdown"
            class="editor-textarea"
            placeholder="Enter new markdown..."
          />
        </div>

        <div class="editor editor--final">
          <div class="editor-header">
            <span class="label">Final Markdown（accept/reject 导出）</span>
          </div>
          <textarea
            v-model="finalMarkdown"
            class="editor-textarea"
            readonly
            placeholder="Resolve hunks to build final markdown..."
          />
        </div>
      </div>

      <div class="diff-section">
        <div class="result-card">
          <div class="result-header">
            <span class="label">Rendered Diff Result</span>
          </div>
          <MarkdownDiff :old-markdown="oldMarkdown" :new-markdown="newMarkdown" />
        </div>
      </div>

      <div class="ast-section">
        <div class="result-card ast-card">
          <div class="result-header">
            <span class="label">Old AST（预览）</span>
          </div>
          <JsonViewer :value="oldAstPreview()" :expand-depth="2" class="json-viewer" />
        </div>

        <div class="result-card ast-card">
          <div class="result-header">
            <span class="label">New AST（预览）</span>
          </div>
          <JsonViewer :value="newAstPreview()" :expand-depth="2" class="json-viewer" />
        </div>
      </div>

      <div class="merged-ast-section">
        <div class="result-card ast-card merged-ast-card">
          <div class="result-header">
            <span class="label">Working AST</span>
          </div>
          <JsonViewer :value="workingMdast" :expand-depth="2" class="json-viewer" />
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

.scenario-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  border-radius: 12px;
  padding: 12px 20px;
  margin-bottom: 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

.scenario-selector .label {
  white-space: nowrap;
  color: #555;
  font-size: 0.95rem;
}

.scenario-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  background: #fafafa;
  color: #333;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.scenario-select:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.scenario-count {
  font-size: 0.85rem;
  color: #888;
  white-space: nowrap;
}

.editor-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.editor-section--triple {
  grid-template-columns: 1fr 1fr 1fr;
}

.editor {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.editor--final .editor-textarea {
  background: #f0fdf4;
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
  margin-bottom: 20px;
}

.merged-ast-section {
  margin-bottom: 20px;
}

.merged-ast-card {
  max-height: 600px;
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

@media (max-width: 1100px) {
  .editor-section--triple {
    grid-template-columns: 1fr;
  }
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
