/**
 * TeX 块级定界符归一化。
 *
 * 模型常把公式写成 \[ … \]，但 \[ 是块级围栏，而围栏不能跨越列表项边界：
 * 列表项里缩进的 \[ 配顶格的 \] 时，闭合围栏落在列表外，整段退化成纯文本。
 * 这里把独占一行的 \[ … \] 改写成顶格、前后留空行的 $$ … $$，
 * 与模型直接写 $$ 时已经能正常渲染的形状一致。
 *
 * 未闭合的 \[ 必须去掉：llm-math 的 TeX 围栏在缺少闭合时会断言失败抛错，
 * 流式输出中必然出现这种半截状态。去掉定界符后正文按普通文本显示，闭合后自动变成公式。
 *
 * 围栏代码块内的内容不动；含反引号的行按代码处理，避免改到行内代码示例。
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BLOCK_OPEN = /^\s*\\\[\s*$/
const BLOCK_CLOSE = /^\s*\\\]\s*$/

/** 把独占一行的 \[ … \] 改成 $$ … $$；未闭合时丢弃定界符、保留正文 */
export const normalizeTexBlocks = (input: string): string => {
  if (!input.includes('\\[')) {
    return input
  }
  const lines = input.split('\n')
  const out: string[] = []
  /** 正在收集的块内容；闭合后整块输出，未闭合则原样当作普通行 */
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
        // 顶格围栏前留空行，避免被当成上一段（或列表项）的延续
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
