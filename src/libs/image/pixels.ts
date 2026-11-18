/**
 * 构图 + 像素滤镜。
 *
 * 去白底 / 单色都使用 fabric 自带的 filter（RemoveColor / BlendColor），
 * 由 Canvas2dFilterBackend 统一跑 2D 管线，避免自己维护阈值算法。
 */
import { Canvas2dFilterBackend, Color, filters } from '#fabric'
import { createCanvas } from './imageio.ts'
import type { FillMode, PixelFilterState } from './types.ts'

type FilterLike = InstanceType<typeof filters.RemoveColor> | InstanceType<typeof filters.BlendColor>

/**
 * 把源图按图层框比例构图：
 * - contain：整张图等比缩放后居中，四周留透明
 * - fill：按框比例居中裁切，铺满整个框
 *
 * 画布分辨率沿用源图像素，缩放交给 fabric 的 scaleX/scaleY。
 */
export function composeBase(
  source: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  fillMode: FillMode,
): HTMLCanvasElement {
  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height
  if (!sourceWidth || !sourceHeight || !frameWidth || !frameHeight) {
    return createCanvas(sourceWidth || 1, sourceHeight || 1)
  }

  const frameRatio = frameWidth / frameHeight
  const sourceRatio = sourceWidth / sourceHeight

  let canvasWidth: number
  let canvasHeight: number
  if (fillMode === 'fill') {
    if (sourceRatio > frameRatio) {
      canvasHeight = sourceHeight
      canvasWidth = sourceHeight * frameRatio
    } else {
      canvasWidth = sourceWidth
      canvasHeight = sourceWidth / frameRatio
    }
  } else if (sourceRatio > frameRatio) {
    canvasWidth = sourceWidth
    canvasHeight = sourceWidth / frameRatio
  } else {
    canvasHeight = sourceHeight
    canvasWidth = sourceHeight * frameRatio
  }

  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('[ImageLayer] 浏览器不支持 Canvas 2D')

  const dx = (canvas.width - sourceWidth) / 2
  const dy = (canvas.height - sourceHeight) / 2
  ctx.drawImage(source, dx, dy, sourceWidth, sourceHeight)
  return canvas
}

/**
 * 单色滤镜的颜色归一化：
 * 空值、transparent、none、以及 alpha 为 0 的颜色都视为“关闭”。
 */
export function normalizeTintColor(value: string | null | undefined): string | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  if (lower === 'transparent' || lower === 'none') return null

  const [, , , alpha] = new Color(raw).getSource()
  return alpha === 0 ? null : raw
}

/** RemoveColor 的 distance 是 0-1，映射自 0-255 的白色阈值 */
function whiteDistance(threshold: number): number {
  const value = Math.min(255, Math.max(0, threshold))
  return Math.min(1, Math.max(0, (255 - value) / 255))
}

/**
 * 依次应用去白底与单色滤镜。
 * 顺序固定为「先去白底再染色」，与旧实现一致；单色可单独开启。
 */
export function applyPixelFilters(
  source: HTMLCanvasElement,
  state: PixelFilterState,
): HTMLCanvasElement {
  const list: FilterLike[] = []
  if (state.removeWhite) {
    list.push(
      new filters.RemoveColor({
        color: '#ffffff',
        distance: whiteDistance(state.whiteThreshold),
      }),
    )
  }
  const tintColor = normalizeTintColor(state.tintColor)
  if (tintColor) {
    list.push(new filters.BlendColor({ color: tintColor, mode: 'tint', alpha: 1 }))
  }
  if (!list.length) return source

  const target = createCanvas(source.width, source.height)
  const backend = new Canvas2dFilterBackend()
  backend.applyFilters(
    list as unknown as Parameters<Canvas2dFilterBackend['applyFilters']>[0],
    source,
    source.width,
    source.height,
    target,
  )
  return target
}