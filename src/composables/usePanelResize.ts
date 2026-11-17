import { useEventListener } from '@vueuse/core'
import { ref } from 'vue'

export interface PanelResizeOptions {
  /** 初始宽度 */
  initial: number
  /** 最小宽度，拖到这里就停住 */
  min: number
  /** 最大宽度 */
  max: number
  /** 1：手柄右边的面板（左侧栏）；-1：手柄左边的面板（右侧栏） */
  direction?: 1 | -1
}

/** 位移小于该值视为点击，否则视为拖动 */
const CLICK_THRESHOLD = 3

/**
 * 侧栏宽度：拖动改变、单击收起 / 展开。
 * 全局指针事件交给 useEventListener，作用域销毁时自动解绑。
 */
export function usePanelResize({ initial, min, max, direction = 1 }: PanelResizeOptions) {
  const width = ref(initial)
  const collapsed = ref(false)
  /** 真正开始拖动后才为 true，用于跟手渲染 */
  const resizing = ref(false)

  let pressed = false
  let dragging = false
  let startX = 0
  let startWidth = 0

  const clamp = (value: number) => Math.min(max, Math.max(min, value))

  function toggle() {
    collapsed.value = !collapsed.value
  }

  function onPointerDown(e: PointerEvent) {
    // 只响应左键；收起状态下拖动可以直接把面板拉出来
    if (e.button !== 0) return
    e.preventDefault()
    pressed = true
    dragging = false
    startX = e.clientX
    startWidth = collapsed.value ? min : width.value
  }

  useEventListener(window, 'pointermove', (e: PointerEvent) => {
    if (!pressed) return
    const delta = (e.clientX - startX) * direction
    if (!dragging) {
      if (Math.abs(delta) < CLICK_THRESHOLD) return
      dragging = true
      resizing.value = true
      collapsed.value = false
    }
    width.value = clamp(startWidth + delta)
  })

  function finish(isClick: boolean) {
    if (!pressed) return
    pressed = false
    resizing.value = false
    // 没拖动过就是单击：切换收起 / 展开
    if (isClick && !dragging) toggle()
    dragging = false
  }

  useEventListener(window, 'pointerup', () => finish(true))
  useEventListener(window, 'pointercancel', () => finish(false))

  return { width, collapsed, resizing, toggle, onPointerDown }
}
