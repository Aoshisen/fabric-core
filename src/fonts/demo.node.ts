/**
 * node 端在线字体端到端演示（不依赖公网，本地起一个 HTTP 服务提供 .ttf）：
 *
 *   npm run demo:font:node
 *
 * 验证链路：URL → 名称/格式解析 → 加载层自动注册（fetch → 临时文件 → registerFont）
 * → Textbox 排版 / 渲染 → 序列化 / 反序列化（classRegistry）→ PNG 输出。
 *
 * 这里不手动 registerFont：Font.load() 会通过 #font-runtime 的 node 实现自动完成。
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename } from 'node:path'
import { StaticCanvas, util } from 'fabric/node'
import type { FontTextInstance } from './core/FontText.ts'
import { Font, FontText } from './node.ts'

const LATIN_CANDIDATES = [
  process.env.FONT_FILE,
  '/System/Library/Fonts/Supplemental/Andale Mono.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
].filter((value): value is string => Boolean(value))

/** 带中文字形的字体，用来验证「不需要系统装字体也能画 CJK」 */
const CJK_CANDIDATES = [
  process.env.FONT_FILE_CJK,
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
].filter((value): value is string => Boolean(value))

const latinFile = LATIN_CANDIDATES.find((candidate) => existsSync(candidate))
if (!latinFile) {
  throw new Error('找不到可用的 .ttf 字体，请通过环境变量 FONT_FILE 指定一个本地 ttf 文件')
}
const cjkFile = CJK_CANDIDATES.find((candidate) => existsSync(candidate))

const files = new Map<string, Buffer>()
for (const file of [latinFile, cjkFile]) {
  if (file) files.set(basename(file), await readFile(file))
}

const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '').split('/').pop() ?? '')
  const bytes = files.get(name)
  if (bytes) {
    res.writeHead(200, {
      'Content-Type': 'font/ttf',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': bytes.length,
    })
    res.end(bytes)
  } else {
    res.writeHead(404)
    res.end()
  }
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('无法取得本地服务端口')
const base = `http://127.0.0.1:${address.port}/fonts`

try {
  const latinURL = `${base}/${encodeURIComponent(basename(latinFile))}`
  console.log('[1] 在线字体 URL :', latinURL)


  const descriptor = Font.parse(latinURL)
  console.log('[2] 正则解析结果 :', {
    name: descriptor.name,
    family: descriptor.family,
    extension: descriptor.extension,
    format: descriptor.format,
    cssFormat: descriptor.cssFormat,
  })
  console.log('[2b] 生成的 CSS  :\n' + descriptor.css)

  const started = performance.now()
  console.log('[3] 字体描述     :', {
    family: descriptor.family,
    format: descriptor.format,
    ms: Number((performance.now() - started).toFixed(1)),
  })

  const box = new FontText('Glyph Path Text 123', {
    font: { name: descriptor.family, url: latinURL },
    autoLoad: false,
    // fabric 默认原点是 center，这里显式用左上角，left/top 才是「左上角坐标」
    originX: 'left',
    originY: 'top',
    left: 40,
    top: 40,
    fontSize: 40,
    fill: '#1b2027',
  })
  await box.loadFont()

  console.log('[4] 图层状态     :', {
    fontStatus: box.fontStatus,
    lines: box.textLines.length,
    width: Number(box.width.toFixed(1)),
    height: Number(box.height.toFixed(1)),
  })

  const serialized = box.toObject() as unknown as Record<string, unknown>
  console.log('[5] 序列化       :', {
    type: serialized.type,
    font: serialized.font,
    text: serialized.text,
    width: serialized.width,
  })

  const [restored] = await util.enlivenObjects([serialized])
  const restoredBox = restored as unknown as FontTextInstance | undefined
  console.log('[6] 反序列化还原 :', {
    type: restoredBox?.constructor?.name,
    text: restoredBox?.text,
    font: restoredBox?.font,
  })

  const canvas = new StaticCanvas(undefined, {
    width: 880,
    height: 560,
    backgroundColor: '#ffffff',
  })

  canvas.add(box)

  // 换行 + 字距 + 居中：验证自己算的排版
  const wrapped = new FontText(
    'The quick brown fox jumps over the lazy dog, wrapping inside 360px with letter spacing.',
    {
      font: { name: descriptor.family, url: latinURL },
      autoLoad: false,
      // fabric 默认原点是 center，这里显式用左上角，left/top 才是「左上角坐标」
    originX: 'left',
    originY: 'top',
    left: 40,
      top: 130,
      fontSize: 20,
      width: 360,
      charSpacing: 50, // 50/1000 em，约等于 fontSize 20 下的 1px 字距
      lineHeight: 1.5,
      textAlign: 'center',
      fill: '#38455c',
    },
  )
  await wrapped.loadFont()
  canvas.add(wrapped)
  console.log('[7] 换行图层     :', {
    lines: wrapped.textLines.length,
    height: Number(wrapped.height.toFixed(1)),
    width: Number(wrapped.width.toFixed(1)),
  })

  // 中文：不注册字体也能画
  if (cjkFile) {
    const cjkURL = `${base}/${encodeURIComponent(basename(cjkFile))}`
    const cjkDescriptor = Font.parse(cjkURL)
    console.log('[8] CJK 字体     :', {
      name: cjkDescriptor.family,
      file: basename(cjkFile),
    })

    const cjk = new FontText('在线字体渲染：字形转路径后直接绘制，不再依赖系统是否装过这个字体。', {
      font: { name: cjkDescriptor.family, url: cjkURL },
      autoLoad: false,
      originX: 'left',
      originY: 'top',
      left: 440,
      top: 130,
      fontSize: 24,
      width: 380,
      lineHeight: 1.8,
      charSpacing: 42, // 约等于 fontSize 24 下的 1px 字距
      fill: '#1b2027',
    })
    await cjk.loadFont()
    canvas.add(cjk)
    console.log('[8b] CJK 换行    :', {
      lines: cjk.textLines.length,
      height: Number(cjk.height.toFixed(1)),
    })
  } else {
    console.log('[8] 跳过 CJK（未找到带中文字形的字体，可用 FONT_FILE_CJK 指定）')
  }

  canvas.renderAll()
  await mkdir('dist', { recursive: true })
  await writeFile('dist/node-font-demo.png', canvas.getNodeCanvas().toBuffer('image/png'))
  console.log('[10] 已输出 PNG : dist/node-font-demo.png')

  canvas.dispose()
} finally {
  server.close()
}
