/**
 * node 端在线字体端到端演示（不依赖公网，本地起一个 HTTP 服务提供 .ttf）：
 *
 *   npm run demo:font:node
 *
 * 会验证：URL → family 推导、网络下载 + node-canvas 注册、FontManager 注册表、
 * FontTextBox 序列化/反序列化往返（classRegistry）、以及真实 PNG 渲染。
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename } from 'node:path'
import { StaticCanvas, util } from 'fabric/node'
import type { FontTextBoxInstance } from './core/createFontTextBox.ts'
import { FontTextBox, deriveFontFamily, fontManager } from './node.ts'

const FONT_CANDIDATES = [
  process.env.FONT_FILE,
  '/System/Library/Fonts/Supplemental/Andale Mono.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
].filter((value): value is string => Boolean(value))

const fontFile = FONT_CANDIDATES.find((candidate) => existsSync(candidate))
if (!fontFile) {
  throw new Error('找不到可用的 .ttf 字体，请通过环境变量 FONT_FILE 指定一个本地 ttf 文件')
}

const fileName = basename(fontFile)
const fontBytes = await readFile(fontFile)
const server = createServer((req, res) => {
  if (req.url?.startsWith('/fonts/')) {
    res.writeHead(200, {
      'Content-Type': 'font/ttf',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': fontBytes.length,
    })
    res.end(fontBytes)
  } else {
    res.writeHead(404)
    res.end()
  }
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('无法取得本地服务端口')

const fontURL = `http://127.0.0.1:${address.port}/fonts/${encodeURIComponent(fileName)}`

try {
  console.log('[1] 在线字体 URL :', fontURL)
  console.log('[2] 推导的字体名 :', deriveFontFamily(fontURL))

  // node-canvas 要求字体在创建画布 / 文本对象之前注册，所以必须先 await
  const record = await fontManager.load(fontURL)
  console.log('[3] 注册表记录   :', {
    family: record.family,
    status: record.status,
    runtime: record.runtime,
    format: record.format,
    cachedAt: record.detail,
  })
  console.log('[4] manager.list():', fontManager.list().map((r) => `${r.family} (${r.status})`))

  const box = new FontTextBox('Online Font 123', {
    fontURL,
    autoLoad: false,
    left: 40,
    top: 50,
    width: 720,
    fontSize: 44,
    fill: '#1b2027',
  })
  await box.loadFont()
  console.log('[5] 图层 fontFamily:', box.fontFamily, '| fontStatus:', box.fontStatus)

  const serialized = box.toObject() as unknown as Record<string, unknown>
  console.log('[6] 序列化 type / fontURL:', serialized.type, '/', serialized.fontURL)

  const [restored] = await util.enlivenObjects([serialized])
  const restoredBox = restored as unknown as FontTextBoxInstance | undefined
  console.log('[7] 反序列化还原 :', {
    type: restoredBox?.constructor?.name,
    fontURL: restoredBox?.fontURL,
    fontFamily: restoredBox?.fontFamily,
  })

  const canvas = new StaticCanvas(undefined, {
    width: 800,
    height: 200,
    backgroundColor: '#ffffff',
  })
  canvas.add(box)
  canvas.renderAll()

  await mkdir('dist', { recursive: true })
  await writeFile('dist/node-font-demo.png', canvas.getNodeCanvas().toBuffer('image/png'))
  console.log('[8] 已输出 PNG  : dist/node-font-demo.png')

  canvas.dispose()
} finally {
  server.close()
}
