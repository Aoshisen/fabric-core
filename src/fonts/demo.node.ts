/**
 * node 端在线字体端到端演示（不依赖公网，本地起一个 HTTP 服务提供 .ttf）：
 *
 *   npm run demo:font:node
 *
 * 验证链路：URL → 名称/格式解析 → fetch + opentype 解析 → 排版 → 单对象路径渲染
 * → 序列化 / 反序列化（classRegistry）→ PNG 输出。
 *
 * 注意这里**没有** canvas.registerFont：字形来自 opentype 的轮廓数据，
 * 所以 node 端也能直接画中文，不再受系统缺字 / woff2 不支持这些限制。
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename } from 'node:path'
import { StaticCanvas, util } from 'fabric/node'
import type { FontTextInstance } from './core/createFontText.ts'
import { FontText, fontManager } from './node.ts'

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

  const descriptor = fontManager.parseFontURL(latinURL)
  console.log('[2] 正则解析结果 :', {
    name: descriptor.name,
    family: descriptor.family,
    extension: descriptor.extension,
    format: descriptor.format,
    cssFormat: descriptor.cssFormat,
  })
  console.log('[2b] 生成的 CSS  :\n' + descriptor.css)

  const started = performance.now()
  const record = await fontManager.load(latinURL)
  const font = fontManager.getFont(latinURL)
  console.log('[3] 加载完成     :', {
    status: record.status,
    detail: record.detail,
    glyphs: font?.numGlyphs,
    ms: Number((performance.now() - started).toFixed(1)),
  })

  const box = new FontText('Glyph Path Text 123', {
    fontURL: latinURL,
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

  const layout = box.getLayout()
  console.log('[4] 图层状态     :', {
    fontStatus: box.fontStatus,
    lines: layout?.lines.length,
    width: Number(box.width.toFixed(1)),
    height: Number(box.height.toFixed(1)),
    pathChars: layout?.pathData.length,
  })

  const serialized = box.toObject() as unknown as Record<string, unknown>
  console.log('[5] 序列化       :', {
    type: serialized.type,
    fontURL: serialized.fontURL,
    text: serialized.text,
    wrapWidth: serialized.wrapWidth,
  })

  const [restored] = await util.enlivenObjects([serialized])
  const restoredBox = restored as unknown as FontTextInstance | undefined
  console.log('[6] 反序列化还原 :', {
    type: restoredBox?.constructor?.name,
    text: restoredBox?.text,
    fontURL: restoredBox?.fontURL,
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
      fontURL: latinURL,
      autoLoad: false,
      // fabric 默认原点是 center，这里显式用左上角，left/top 才是「左上角坐标」
    originX: 'left',
    originY: 'top',
    left: 40,
      top: 130,
      fontSize: 20,
      wrapWidth: 360,
      letterSpacing: 1,
      lineHeight: 1.5,
      align: 'center',
      fill: '#38455c',
    },
  )
  await wrapped.loadFont()
  canvas.add(wrapped)
  console.log('[7] 换行图层     :', {
    lines: wrapped.getLayout()?.lines.length,
    height: Number(wrapped.height.toFixed(1)),
    width: Number(wrapped.width.toFixed(1)),
  })

  // 中文：不注册字体也能画
  if (cjkFile) {
    const cjkURL = `${base}/${encodeURIComponent(basename(cjkFile))}`
    const cjkStart = performance.now()
    await fontManager.load(cjkURL)
    const cjkFont = fontManager.getFont(cjkURL)
    console.log('[8] CJK 字体     :', {
      glyphs: cjkFont?.numGlyphs,
      parseMs: Number((performance.now() - cjkStart).toFixed(1)),
    })

    const cjk = new FontText('在线字体渲染：字形转路径后直接绘制，不再依赖系统是否装过这个字体。', {
      fontURL: cjkURL,
      autoLoad: false,
      originX: 'left',
      originY: 'top',
      left: 440,
      top: 130,
      fontSize: 24,
      wrapWidth: 380,
      lineHeight: 1.8,
      letterSpacing: 1,
      fill: '#1b2027',
    })
    await cjk.loadFont()
    canvas.add(cjk)
    console.log('[8b] CJK 换行    :', {
      lines: cjk.getLayout()?.lines.length,
      height: Number(cjk.height.toFixed(1)),
    })
  } else {
    console.log('[8] 跳过 CJK（未找到带中文字形的字体，可用 FONT_FILE_CJK 指定）')
  }

  console.log('[9] manager.list():', fontManager.list().map((r) => `${r.family} (${r.status}, ${r.detail ?? '-'})`))

  canvas.renderAll()
  await mkdir('dist', { recursive: true })
  await writeFile('dist/node-font-demo.png', canvas.getNodeCanvas().toBuffer('image/png'))
  console.log('[10] 已输出 PNG : dist/node-font-demo.png')

  canvas.dispose()
} finally {
  server.close()
}
