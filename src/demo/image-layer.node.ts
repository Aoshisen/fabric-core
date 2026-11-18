/**
 * node 端 ImageLayer 端到端演示（不依赖公网，图片资产在内存里用 node-canvas 生成）：
 *
 *   npm run demo:image:node
 *
 * 验证链路：构图（contain/fill）→ 去白底 → 单色 → 外/内描边 → 蒙版
 * → 序列化 → PNG 输出。
 *
 * 输出：dist/node-image-layer-demo.png
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createCanvas } from 'canvas'
import { StaticCanvas, Textbox, util } from 'fabric/node'
import type { ImageLayerOptions } from '../libs/node.ts'
import { ImageLayer } from '../libs/node.ts'

function toPngDataURL(canvas: ReturnType<typeof createCanvas>): string {
  return canvas.toDataURL('image/png')
}

/** 白底样图：去白底、contain/fill、蒙版都用它 */
function createSourceImage(): string {
  const canvas = createCanvas(480, 320)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#2f6fed'
  ctx.beginPath()
  ctx.arc(150, 160, 100, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ff8a3d'
  ctx.fillRect(250, 80, 170, 160)

  ctx.fillStyle = '#1b2027'
  ctx.font = 'bold 34px sans-serif'
  ctx.fillText('SAMPLE', 258, 175)

  return toPngDataURL(canvas)
}

/** 透明底图标：单色滤镜与描边用它，避免把整张矩形当成形状 */
function createIconImage(): string {
  const canvas = createCanvas(300, 300)
  const ctx = canvas.getContext('2d')
  const cx = 150
  const cy = 158
  const outer = 118
  const inner = 50
  const points = 5

  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (Math.PI / points) * i - Math.PI / 2
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = '#1e293b'
  ctx.fill()

  return toPngDataURL(canvas)
}

/** 蒙版：不透明圆形 + 透明背景，按 alpha 保留 */
function createMaskImage(): string {
  const canvas = createCanvas(360, 360)
  const ctx = canvas.getContext('2d')

  ctx.beginPath()
  ctx.arc(180, 180, 120, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()

  return toPngDataURL(canvas)
}

const sourceSrc = createSourceImage()
const iconSrc = createIconImage()
const maskSrc = createMaskImage()

// 画布用浅灰底：去白底 / 蒙版的透明区域才看得出来
const canvas = new StaticCanvas(undefined, {
  width: 1280,
  height: 960,
  backgroundColor: '#dbe3ec',
})

function label(text: string, x: number, y: number, width: number): void {
  canvas.add(
    new Textbox(text, {
      left: x,
      top: y,
      width,
      fontSize: 14,
      fill: '#334155',
      fontFamily: 'sans-serif',
      originX: 'left',
      originY: 'top',
    }),
  )
}

interface Case {
  name: string
  x: number
  y: number
  width: number
  height: number
  options: ImageLayerOptions
}

const cases: Case[] = [
  {
    name: 'contain',
    x: 40,
    y: 60,
    width: 360,
    height: 240,
    options: { fillMode: 'contain' },
  },
  {
    name: 'fill',
    x: 440,
    y: 60,
    width: 300,
    height: 300,
    options: { fillMode: 'fill' },
  },
  {
    name: 'removeWhite',
    x: 840,
    y: 60,
    width: 360,
    height: 240,
    options: { removeWhite: true, whiteThreshold: 200 },
  },
  {
    name: 'tint',
    x: 40,
    y: 380,
    width: 300,
    height: 300,
    options: { tintColor: '#e11d48' },
  },
  {
    name: 'outline outer',
    x: 400,
    y: 380,
    width: 300,
    height: 300,
    options: { outlineWidth: 10, outlineColor: '#111827', outlineAlign: 'outer' },
  },
  {
    name: 'outline inner',
    x: 760,
    y: 380,
    width: 300,
    height: 300,
    options: { outlineWidth: 14, outlineColor: '#f59e0b', outlineAlign: 'inner' },
  },
  {
    name: 'mask',
    x: 40,
    y: 740,
    width: 300,
    height: 220,
    options: { maskSrc },
  },
  {
    name: 'combo',
    x: 400,
    y: 740,
    width: 300,
    height: 220,
    options: {
      fillMode: 'fill',
      removeWhite: true,
      tintColor: '#2563eb',
      outlineWidth: 6,
      outlineColor: '#0f172a',
      outlineAlign: 'outer',
      maskSrc,
    },
  },
]

const layers: ImageLayer[] = []

for (const item of cases) {
  const layer = new ImageLayer({
    originX: 'left',
    originY: 'top',
    left: item.x,
    top: item.y,
    frameWidth: item.width,
    frameHeight: item.height,
    ...item.options,
  })

  const isIconCase = ['tint', 'outline outer', 'outline inner'].includes(item.name)
  await layer.setSource(isIconCase ? iconSrc : sourceSrc)

  canvas.add(layer)
  layers.push(layer)

  label(item.name, item.x, item.y - 24, item.width)

  console.log(`[case] ${item.name.padEnd(13)} frame=${item.width}x${item.height} ` +
    `display=${layer.width}x${layer.height} scale=${layer.scaleX.toFixed(4)} ` +
    `fillMode=${layer.fillMode} outline=${layer.outlineAlign}:${layer.outlineWidth}`)
}

// 序列化 / 反序列化：确认自定义字段与 classRegistry 都正常
const sample = layers.find((layer) => layer.outlineWidth > 0)!
const serialized = sample.toObject() as Record<string, unknown>
console.log('[serialize]', {
  type: serialized.type,
  src: typeof serialized.src === 'string' ? `data-url(${serialized.src.length} chars)` : serialized.src,
  fillMode: serialized.fillMode,
  outlineWidth: serialized.outlineWidth,
  outlineAlign: serialized.outlineAlign,
  maskSrc: typeof serialized.maskSrc === 'string' ? 'data-url' : serialized.maskSrc,
})

const [restored] = await util.enlivenObjects([JSON.parse(JSON.stringify(serialized))])
const restoredLayer = restored as ImageLayer | undefined
console.log('[enliven]', {
  class: restoredLayer?.constructor?.name,
  fillMode: restoredLayer?.fillMode,
  outlineWidth: restoredLayer?.outlineWidth,
  hasSrc: Boolean(restoredLayer?.declaredSrc),
})

canvas.renderAll()
await mkdir('dist', { recursive: true })
await writeFile('dist/node-image-layer-demo.png', canvas.getNodeCanvas().toBuffer('image/png'))
console.log('[output] dist/node-image-layer-demo.png')

canvas.dispose()