/**
 * 轮廓描边：从旧实现 uploadPictureOutline.js 移植并类型化。
 *
 * 算法：alpha 阈值 → 8 邻域边界追踪 → Path2D 平滑 → 描边。
 * - outer：画布四周扩边，描完用剪影挖掉内部，再叠原图
 * - inner：先画原图，再以 source-atop 描边，描边只落在已有像素上
 *
 * 全部在源图像素坐标里计算，显示宽度由上层按缩放换算。
 */
import { createCanvas } from './imageio.ts'
import type { StrokeAlign } from './types.ts'

const ALPHA_THRESHOLD = 112
const MIN_CONTOUR_AREA = 40

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

interface Point {
  x: number
  y: number
}

/** 描边需要扩出的画布边距（源图像素）；内描边不扩边 */
export function outlineMargin(strokeWidth: number, align: StrokeAlign): number {
  return align === 'inner' ? 0 : Math.ceil(strokeWidth) + 4
}

export interface OutlineBuildOptions {
  /** 源图像素坐标下的描边宽度 */
  sourcePixelWidth: number
  color: string
  align: StrokeAlign
}

function signedArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return area / 2
}

function dedupeContour(points: Point[]): Point[] {
  if (points.length < 2) return points
  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]
    if (prev.x !== points[i].x || prev.y !== points[i].y) result.push(points[i])
  }
  if (result.length > 2) {
    const first = result[0]
    const last = result[result.length - 1]
    if (first.x === last.x && first.y === last.y) result.pop()
  }
  return result
}

/**
 * 一次 alpha 扫描同时产出：
 * - 边界追踪用的二值 mask
 * - 白色剪影（复用同一块画布，用 source-in 批量染色，不逐像素写 ImageData）
 */
function analyzeAlpha(source: HTMLCanvasElement): {
  mask: Uint8Array
  width: number
  height: number
  silhouette: HTMLCanvasElement
} {
  const width = source.width
  const height = source.height
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('[ImageLayer] 浏览器不支持 Canvas 2D')

  ctx.drawImage(source, 0, 0)
  const { data } = ctx.getImageData(0, 0, width, height)
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4 + 3] >= ALPHA_THRESHOLD ? 1 : 0
  }

  // 整块画布染白：source-in 只在已有像素处落色，alpha 原样保留
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  return { mask, width, height, silhouette: canvas }
}

function isBoundary(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  if (mask[y * width + x] !== 1) return false
  return (
    x === 0 ||
    mask[y * width + x - 1] === 0 ||
    x === width - 1 ||
    mask[y * width + x + 1] === 0 ||
    y === 0 ||
    mask[(y - 1) * width + x] === 0 ||
    y === height - 1 ||
    mask[(y + 1) * width + x] === 0
  )
}

function traceBoundary(
  mask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array,
): Point[] {
  const contour: Point[] = []
  let currentX = startX
  let currentY = startY
  let backDirection = 4
  const maxSteps = width * height * 4
  let steps = 0

  do {
    visited[currentY * width + currentX] = 1
    contour.push({ x: currentX + 0.5, y: currentY + 0.5 })

    const startDirection = (backDirection + 5) % 8
    let found = false
    for (let i = 0; i < 8; i++) {
      const direction = (startDirection + i) % 8
      const nextX = currentX + NEIGHBORS[direction][0]
      const nextY = currentY + NEIGHBORS[direction][1]
      if (isBoundary(mask, width, height, nextX, nextY)) {
        backDirection = direction
        currentX = nextX
        currentY = nextY
        found = true
        break
      }
    }
    if (!found) break
    steps++
  } while ((currentX !== startX || currentY !== startY) && steps < maxSteps)

  return dedupeContour(contour)
}

function extractContours(mask: Uint8Array, width: number, height: number): Point[][] {
  const visited = new Uint8Array(width * height)
  const contours: Point[][] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (visited[index] || !isBoundary(mask, width, height, x, y)) continue

      const contour = traceBoundary(mask, width, height, x, y, visited)
      if (contour.length >= 3 && Math.abs(signedArea(contour)) >= MIN_CONTOUR_AREA) {
        contours.push(contour)
      }
    }
  }
  return contours
}

/**
 * 把轮廓点写成当前 context 的路径。
 * 直接用 ctx 的路径命令而不是 Path2D：node-canvas 没有全局 Path2D。
 */
function traceContours(
  ctx: CanvasRenderingContext2D,
  contours: Point[][],
  offsetX: number,
  offsetY: number,
): void {
  for (const contour of contours) {
    if (contour.length < 3) continue
    const points = contour.map((point) => ({
      x: point.x + offsetX,
      y: point.y + offsetY,
    }))
    const count = points.length

    ctx.moveTo(
      (points[count - 1].x + points[0].x) / 2,
      (points[count - 1].y + points[0].y) / 2,
    )
    for (let i = 0; i < count; i++) {
      const current = points[i]
      const next = points[(i + 1) % count]
      ctx.quadraticCurveTo(
        current.x,
        current.y,
        (current.x + next.x) / 2,
        (current.y + next.y) / 2,
      )
    }
    ctx.closePath()
  }
}

/**
 * 生成带描边的画布。
 * 没有有效轮廓或描边宽度为 0 时直接返回原画布。
 */
export function buildOutlinedCanvas(
  source: HTMLCanvasElement,
  options: OutlineBuildOptions,
): HTMLCanvasElement {
  const strokeWidth = options.sourcePixelWidth
  if (strokeWidth <= 0) return source

  const { mask, width, height, silhouette } = analyzeAlpha(source)
  const contours = extractContours(mask, width, height)
  if (!contours.length) return source

  const isInner = options.align === 'inner'
  const margin = outlineMargin(strokeWidth, options.align)
  const canvas = createCanvas(width + margin * 2, height + margin * 2)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('[ImageLayer] 浏览器不支持 Canvas 2D')

  ctx.strokeStyle = options.color
  // 线宽按 2 倍画：外描边有半宽落在形状外后被挖掉，内描边有半宽被 source-atop 裁掉
  ctx.lineWidth = strokeWidth * 2
  ctx.lineJoin = 'miter'
  ctx.miterLimit = 4
  ctx.lineCap = 'butt'

  if (isInner) {
    ctx.drawImage(source, margin, margin)
    ctx.beginPath()
    traceContours(ctx, contours, margin, margin)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    return canvas
  }

  ctx.beginPath()
  traceContours(ctx, contours, margin, margin)
  ctx.stroke()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(silhouette, margin, margin)
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(source, margin, margin)
  return canvas
}