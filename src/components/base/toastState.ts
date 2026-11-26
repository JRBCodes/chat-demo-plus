import { create } from 'zustand'
import type { LinkedMessage, TranslationKey } from '../../i18n/index.js'

/** 提示内的操作按钮（如撤销删除）；点击后先关闭提示再执行。 */
export type ToastAction = { key: TranslationKey; onClick: () => void }

/** 文字提示，可带链接与操作按钮 */
export type ToastMessage = LinkedMessage & { action?: ToastAction }

/** 轻提示：同一时间只显示一条，新的替换旧的，到时自动消失；文案在渲染时按当前语言翻译 */
type ToastState = { id: number; message: ToastMessage | string | null }

export const useToast = create<ToastState>(() => ({ id: 0, message: null }))

const DURATION = 3000
/** 带链接或操作按钮时多留一些时间，方便点击 */
const INTERACTIVE_DURATION = 5000
let timer = 0

export const hideToast = () => {
  window.clearTimeout(timer)
  useToast.setState({ message: null })
}

export const showToast = (message: ToastMessage | string) => {
  window.clearTimeout(timer)
  useToast.setState((state) => ({ id: state.id + 1, message }))
  const interactive =
    typeof message !== 'string' && (message.link !== undefined || message.action !== undefined)
  timer = window.setTimeout(
    () => useToast.setState({ message: null }),
    interactive ? INTERACTIVE_DURATION : DURATION
  )
}
