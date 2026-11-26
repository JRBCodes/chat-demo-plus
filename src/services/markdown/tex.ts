/**
 * TeX 块级定界符归一化。
 *
 * 模型常把公式写成 \[ … \]，但 \[ 是块级围栏，而围栏不能跨越列表项边界：
 * 列表项里缩进的 \[ 配顶格的 \] 时，闭合围栏落在列表外，整段退化成纯文本。
 * 这里把独占一行的 \[ … \] 统一改写成顶格、前后留空行的 $$ … $$，
 * 与模型直接写 $$ 时已经能正常渲染的形状一致。
 *
 * 围栏代码块内的内容不动；含反引号的行按代码处理，避免改到行内代码示例。
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BLOCK_OPEN = /^\s*\\\[\s*$/
const BLOCK_CLOSE = /^\s*\\\]\s*$/

/** 把独占一行的 \[ … \] 改成 $$ … $$；缺闭合标记时原样返回，不猜内容 */
export const normalizeTexBlocks = (input: string): string => {
  if (!input.includes('\\[')) {
    return input
  }
  const lines = input.split('\n')
  const out: string[] = []
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
        out.push('$$', '')
        open = false
      } else {
        out.push(line)
      }
      continue
    }
    if (line.includes('`')) {
      out.push(line)
      continue
    }
    if (BLOCK_OPEN.test(line)) {
      // 顶格围栏前留空行，避免被当成上一段（或列表项）的延续
      if (out.length > 0 && out[out.length - 1].trim() !== '') {
        out.push('')
      }
      out.push('$$')
      open = true
      continue
    }
    out.push(line)
  }
  // 没有闭合的块：整段保持原样，交给后续按纯文本渲染
  if (open) {
    return input
  }
  return out.join('\n')
}
