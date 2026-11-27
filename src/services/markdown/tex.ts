/** \[ … \] 围栏无法跨列表项，且未闭合会触发 llm-math 断言：统一改写成顶格 $$ … $$。 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BLOCK_OPEN = /^\s*\\\[\s*$/
const BLOCK_CLOSE = /^\s*\\\]\s*$/

export const normalizeTexBlocks = (input: string): string => {
  if (!input.includes('\\[')) {
    return input
  }
  const lines = input.split('\n')
  const out: string[] = []
  let block: string[] = []
  let fence: { char: string; size: number } | null = null
  let open = false
  for (const line of lines) {
    if (fence) {
      out.push(line)
      const match = FENCE.exec(line)
      if (match && match[1][0] === fence.char && match[1].length >= fence.size) {
        fence = null
      }
      continue
    }
    const match = FENCE.exec(line)
    if (match) {
      fence = { char: match[1][0], size: match[1].length }
      out.push(line)
      continue
    }
    if (open) {
      if (BLOCK_CLOSE.test(line)) {
        if (out.length > 0 && out[out.length - 1].trim() !== '') {
          out.push('')
        }
        out.push('$$', ...block, '$$', '')
        block = []
        open = false
      } else {
        block.push(line)
      }
      continue
    }
    if (line.includes('`')) {
      out.push(line)
      continue
    }
    if (BLOCK_OPEN.test(line)) {
      open = true
      block = []
      continue
    }
    out.push(line)
  }
  if (open) {
    out.push(...block)
  }
  return out.join('\n')
}
