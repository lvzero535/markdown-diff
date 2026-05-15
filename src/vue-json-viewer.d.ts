declare module 'vue-json-viewer' {
  import type { Component } from 'vue'
  
  const JsonViewer: Component<{
    value: any
    expandDepth?: number
    copyable?: boolean
    sort?: boolean
    boxed?: boolean
    theme?: 'light' | 'dark'
  }>
  
  export default JsonViewer
}
