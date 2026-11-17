import { Circle, Ellipse, IText, Rect, Textbox, type Canvas, type FabricObject } from 'fabric'
import { onScopeDispose, reactive, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { ShapeModel } from './types.ts'

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** fabric 对象 → 表单模型；只读 schema 里声明过的字段 */
function readObject(object: FabricObject): ShapeModel {
  const next: ShapeModel = {
    left: round(object.left),
    top: round(object.top),
    angle: round(object.angle),
    opacity: object.opacity,
    fill: typeof object.fill === 'string' ? object.fill : '',
    stroke: typeof object.stroke === 'string' ? object.stroke : '',
    strokeWidth: object.strokeWidth,
  }

  if (object instanceof Circle) next.radius = round(object.radius)
  else if (object instanceof Ellipse) {
    next.rx = round(object.rx)
    next.ry = round(object.ry)
  }

  if (object instanceof Rect) {
    next.width = round(object.width)
    next.height = round(object.height)
    next.rx = round(object.rx)
    next.ry = round(object.ry)
  } else if (object instanceof Textbox) {
    next.width = round(object.width)
  }

  if (object instanceof IText) {
    next.text = object.text
    next.fontSize = object.fontSize
    next.lineHeight = object.lineHeight
    next.charSpacing = object.charSpacing
    next.textAlign = object.textAlign
    next.fontWeight = Number(object.fontWeight) || 400
  }

  return next
}

export interface UseObjectModelOptions {
  canvas: MaybeRefOrGetter<Canvas | null>
  object: MaybeRefOrGetter<FabricObject | null>
}

/**
 * 表单 ↔ fabric 对象的双向绑定。
 *
 * - 选中变化 / 拖动缩放结束 → 对象 → 模型
 * - 模型（表单）变化 → 写回对象：set + setCoords + 标脏 + 重绘
 *
 * `applying` 守卫打断「读对象触发监听、监听又写对象」的循环。
 */
export function useObjectModel(options: UseObjectModelOptions) {
  const model = reactive<ShapeModel>({})
  let applying = false

  function syncFromObject() {
    applying = true
    const object = toValue(options.object)
    const next = object ? readObject(object) : {}

    for (const key of Object.keys(model) as Array<keyof ShapeModel>) delete model[key]
    Object.assign(model, next)
    applying = false
  }

  function applyToObject() {
    if (applying) return
    const object = toValue(options.object)
    if (!object) return

    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(model)) {
      if (value !== undefined) patch[key] = value
    }

    object.set(patch as never)
    object.setCoords()
    object.dirty = true
    toValue(options.canvas)?.requestRenderAll()
  }

  watch(() => toValue(options.object), syncFromObject, { immediate: true })
  watch(model, applyToObject, { deep: true, flush: 'sync' })

  const onModified = () => syncFromObject()

  watch(
    () => toValue(options.canvas),
    (canvas, previous) => {
      previous?.off('object:modified', onModified)
      canvas?.on('object:modified', onModified)
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    toValue(options.canvas)?.off('object:modified', onModified)
  })

  return { model, syncFromObject, applyToObject }
}
