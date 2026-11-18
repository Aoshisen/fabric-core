/** 图片加载与画布工具 */
import { util } from '#fabric'

/** 创建画布：走 fabric 的 util.createCanvasElement，兼容它内部的 document 获取方式 */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = util.createCanvasElement()
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/** 把任意可绘制源复制成一块新的画布，避免后续被外部修改 */
export function copyToCanvas(
  source: CanvasImageSource & { width: number; height: number },
): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('[ImageLayer] 浏览器不支持 Canvas 2D')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * 加载图片。直接用 fabric 的 util.loadImage，只固定 crossOrigin：
 * 去白底和描边都要读像素，跨域图片不带 anonymous 会污染 canvas。
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return util.loadImage(src, { crossOrigin: 'anonymous' })
}