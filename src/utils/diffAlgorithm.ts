import type { MarkdownNode } from './markdownParser'

export type DiffType = 'add' | 'remove' | 'update' | 'move' | 'none'

export interface DiffResult {
  type: DiffType
  oldNode?: MarkdownNode
  newNode?: MarkdownNode
  oldIndex?: number
  newIndex?: number
  childrenDiff?: DiffResult[]
}

function isSameNode(oldNode: MarkdownNode, newNode: MarkdownNode): boolean {
  if (oldNode.type !== newNode.type) return false
  
  if (oldNode.type === 'heading') {
    return oldNode.level === newNode.level && oldNode.text === newNode.text
  }
  
  if (oldNode.type === 'paragraph') {
    return oldNode.text === newNode.text
  }
  
  if (oldNode.type === 'link') {
    return oldNode.href === newNode.href && oldNode.text === newNode.text
  }
  
  if (oldNode.type === 'text') {
    return oldNode.text === newNode.text
  }
  
  return JSON.stringify(oldNode) === JSON.stringify(newNode)
}

function createPatch(
  type: DiffType,
  oldNode?: MarkdownNode,
  newNode?: MarkdownNode,
  oldIndex?: number,
  newIndex?: number,
  childrenDiff?: DiffResult[]
): DiffResult {
  return {
    type,
    oldNode,
    newNode,
    oldIndex,
    newIndex,
    childrenDiff
  }
}

export function diff(oldAst: MarkdownNode[], newAst: MarkdownNode[]): DiffResult[] {
  const patches: DiffResult[] = []
  const oldStart = 0
  const oldEnd = oldAst.length - 1
  const newStart = 0
  const newEnd = newAst.length - 1
  
  const oldArr = [...oldAst]
  const newArr = [...newAst]
  
  function compare(
    oldStart: number,
    oldEnd: number,
    newStart: number,
    newEnd: number
  ) {
    if (oldStart > oldEnd) {
      for (let i = newStart; i <= newEnd; i++) {
        patches.push(createPatch('add', undefined, newArr[i], undefined, i))
      }
      return
    }
    
    if (newStart > newEnd) {
      for (let i = oldStart; i <= oldEnd; i++) {
        patches.push(createPatch('remove', oldArr[i], undefined, i, undefined))
      }
      return
    }
    
    if (isSameNode(oldArr[oldStart], newArr[newStart])) {
      const childrenDiff = compareChildren(oldArr[oldStart], newArr[newStart])
      if (childrenDiff.length > 0) {
        patches.push(createPatch('update', oldArr[oldStart], newArr[newStart], oldStart, newStart, childrenDiff))
      } else {
        patches.push(createPatch('none', oldArr[oldStart], newArr[newStart], oldStart, newStart))
      }
      compare(oldStart + 1, oldEnd, newStart + 1, newEnd)
      return
    }
    
    if (isSameNode(oldArr[oldEnd], newArr[newEnd])) {
      const childrenDiff = compareChildren(oldArr[oldEnd], newArr[newEnd])
      if (childrenDiff.length > 0) {
        patches.push(createPatch('update', oldArr[oldEnd], newArr[newEnd], oldEnd, newEnd, childrenDiff))
      } else {
        patches.push(createPatch('none', oldArr[oldEnd], newArr[newEnd], oldEnd, newEnd))
      }
      compare(oldStart, oldEnd - 1, newStart, newEnd - 1)
      return
    }
    
    if (isSameNode(oldArr[oldStart], newArr[newEnd])) {
      const childrenDiff = compareChildren(oldArr[oldStart], newArr[newEnd])
      if (childrenDiff.length > 0) {
        patches.push(createPatch('move', oldArr[oldStart], newArr[newEnd], oldStart, newEnd, childrenDiff))
      } else {
        patches.push(createPatch('move', oldArr[oldStart], newArr[newEnd], oldStart, newEnd))
      }
      compare(oldStart + 1, oldEnd, newStart, newEnd - 1)
      return
    }
    
    if (isSameNode(oldArr[oldEnd], newArr[newStart])) {
      const childrenDiff = compareChildren(oldArr[oldEnd], newArr[newStart])
      if (childrenDiff.length > 0) {
        patches.push(createPatch('move', oldArr[oldEnd], newArr[newStart], oldEnd, newStart, childrenDiff))
      } else {
        patches.push(createPatch('move', oldArr[oldEnd], newArr[newStart], oldEnd, newStart))
      }
      compare(oldStart, oldEnd - 1, newStart + 1, newEnd)
      return
    }
    
    const newIndex = findNodeIndex(newArr, oldArr[oldStart], newStart, newEnd)
    if (newIndex !== -1) {
      for (let i = newStart; i < newIndex; i++) {
        patches.push(createPatch('add', undefined, newArr[i], undefined, i))
      }
      const childrenDiff = compareChildren(oldArr[oldStart], newArr[newIndex])
      if (childrenDiff.length > 0) {
        patches.push(createPatch('update', oldArr[oldStart], newArr[newIndex], oldStart, newIndex, childrenDiff))
      } else {
        patches.push(createPatch('none', oldArr[oldStart], newArr[newIndex], oldStart, newIndex))
      }
      compare(oldStart + 1, oldEnd, newIndex + 1, newEnd)
    } else {
      patches.push(createPatch('remove', oldArr[oldStart], undefined, oldStart, undefined))
      compare(oldStart + 1, oldEnd, newStart, newEnd)
    }
  }
  
  compare(oldStart, oldEnd, newStart, newEnd)
  
  return patches
}

function findNodeIndex(arr: MarkdownNode[], target: MarkdownNode, start: number, end: number): number {
  for (let i = start; i <= end; i++) {
    if (isSameNode(arr[i], target)) {
      return i
    }
  }
  return -1
}

function compareChildren(oldNode: MarkdownNode, newNode: MarkdownNode): DiffResult[] {
  const oldChildren = oldNode.children || oldNode.items || []
  const newChildren = newNode.children || newNode.items || []
  
  if (oldChildren.length === 0 && newChildren.length === 0) {
    return []
  }
  
  return diff(oldChildren, newChildren)
}

export function formatDiffResult(patches: DiffResult[]): string {
  const lines: string[] = []
  
  function traverse(patches: DiffResult[], indent = 0) {
    for (const patch of patches) {
      const prefix = '  '.repeat(indent)
      const nodeType = patch.newNode?.type || patch.oldNode?.type || 'unknown'
      
      switch (patch.type) {
        case 'add':
          lines.push(`${prefix}+ [${nodeType}] "${patch.newNode?.text || patch.newNode?.raw || ''}"`)
          break
        case 'remove':
          lines.push(`${prefix}- [${nodeType}] "${patch.oldNode?.text || patch.oldNode?.raw || ''}"`)
          break
        case 'update':
          lines.push(`${prefix}~ [${nodeType}] "${patch.oldNode?.text || ''}" -> "${patch.newNode?.text || ''}"`)
          break
        case 'move':
          lines.push(`${prefix}> [${nodeType}] moved from ${patch.oldIndex} to ${patch.newIndex}`)
          break
        case 'none':
          lines.push(`${prefix}= [${nodeType}] "${patch.newNode?.text || patch.newNode?.raw || ''}"`)
          break
      }
      
      if (patch.childrenDiff && patch.childrenDiff.length > 0) {
        traverse(patch.childrenDiff, indent + 1)
      }
    }
  }
  
  traverse(patches)
  return lines.join('\n')
}