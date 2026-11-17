import { useDebounceFn } from '@vueuse/core'
import type { Canvas } from 'fabric'
import { ref, toValue, type MaybeRefOrGetter } from 'vue'

export interface UseCanvasPreviewOptions {
  canvas: MaybeRefOrGetter<Canvas | null>
  /** 预览不可见时（如选中了图层）跳过缩略图生成 */
  enabled?: MaybeRefOrGetter<boolean>
}

/** 画布快照：序列化后的 JSON + 渲染出的 PNG 缩略图，改动后防抖刷新 */
export function useCanvasPreview({ canvas, enabled = true }: UseCanvasPreviewOptions) {
  const json = ref('{}')
  const image = ref('')

  const syncJson = useDebounceFn(() => {
    const c = toValue(canvas)
    if (!c) return
    json.value = JSON.stringify(c.toObject(), null, 2)
  }, 120)

  const syncImage = useDebounceFn(() => {
    const c = toValue(canvas)
    if (!c || !toValue(enabled)) return
    image.value = c.toDataURL({ format: 'png', multiplier: 1 })
  }, 320)

  function sync() {
    syncJson()
    syncImage()
  }

  return { json, image, sync }
}
