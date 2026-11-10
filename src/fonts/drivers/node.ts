/**
 * ⚠️ 仅 node 端可用。浏览器侧请不要 import 本文件。
 *
 * node 端没有 FontFace / document.fonts，字体必须通过 node-canvas 的
 * registerFont 注册。而 canvas 3.x 的 registerFont 只接受「本地文件路径」，
 * 不接受 Buffer，也不支持 woff / woff2，所以这里先把在线字体落盘再注册。
 *
 * 另一个重要限制：node-canvas 的字体注册是进程级、不可单字体撤销的，
 * 且必须在创建 StaticCanvas / 文本对象之前完成，否则字体不会生效。
 * 因此 node 端推荐先 `await fontManager.load(url)`，再创建画布和图层。
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FontDriver, FontFormat } from '../core/types.ts'

const CANVAS_SPECIFIER = 'canvas'

interface CanvasFontApi {
  registerFont(
    path: string,
    face: { family: string; weight?: string; style?: string },
  ): void
}

export interface NodeFontDriverOptions {
  /** 字体缓存目录，默认系统临时目录下的 fabric-core-fonts */
  cacheDir?: string
}

function sniffFormat(bytes: Uint8Array): FontFormat {
  const tag = String.fromCharCode(...bytes.subarray(0, 4))
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'OTTO') return 'otf'
  if (tag === 'true' || tag === 'ttcf' || tag === 'typ1') return 'ttf'
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return 'ttf'
  }
  return 'unknown'
}

function safeFileName(value: string): string {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'font'
}

export function createNodeDriver(options: NodeFontDriverOptions = {}): FontDriver {
  const cacheDir = options.cacheDir ?? join(tmpdir(), 'fabric-core-fonts')
  let canvasApiPromise: Promise<CanvasFontApi> | null = null

  // 用变量 specifier + @vite-ignore 让打包器不要把 canvas 打进浏览器产物。
  // 只有真正调用 node 驱动的 load() 时才会加载这个原生模块。
  function getCanvasApi(): Promise<CanvasFontApi> {
    canvasApiPromise ??= import(/* @vite-ignore */ CANVAS_SPECIFIER)
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `[font] node 端需要 node-canvas，请先执行 npm i canvas（ fabric/node 也依赖它）：${reason}`,
        )
      })
      .then((mod) => mod as unknown as CanvasFontApi)
    return canvasApiPromise
  }

  return {
    runtime: 'node',

    async load({ url, family, format, signal }) {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new Error(`[font] 下载字体失败 ${url}：HTTP ${response.status}`)
      }

      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length === 0) throw new Error(`[font] 字体内容为空 ${url}`)

      const realFormat = format === 'unknown' ? sniffFormat(bytes) : format
      if (realFormat === 'woff' || realFormat === 'woff2') {
        throw new Error(
          `[font] node-canvas 只支持 ttf / otf，无法使用 ${realFormat} 字体：${url}。` +
            '请改用 ttf/otf 地址，或先把 woff2 转成 ttf（例如 fonttools / woff2_decompress）。',
        )
      }

      await mkdir(cacheDir, { recursive: true })
      const hash = createHash('sha1').update(url).digest('hex').slice(0, 12)
      const extension = realFormat === 'otf' ? 'otf' : 'ttf'
      const filePath = join(cacheDir, `${safeFileName(family)}-${hash}.${extension}`)
      await writeFile(filePath, Buffer.from(bytes))

      const canvas = await getCanvasApi()
      try {
        canvas.registerFont(filePath, { family })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`[font] registerFont 失败 ${family}（${filePath}）：${reason}`)
      }

      // node-canvas 没有单字体注销接口，dispose 故意不提供。
      return { detail: filePath }
    },
  }
}

export const nodeFontDriver = createNodeDriver()
