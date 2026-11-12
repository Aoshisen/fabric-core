import { parseFont, type OtFont } from './opentype.ts'
import type { FontFormat, FontLoadOptions, FontRecord, FontStatus, FontURLDescriptor } from './types.ts'

/**
 * 一条正则，一次匹配同时取出「文件名主干」与「字体扩展名」。
 *
 * - `(?:.*[/\\])?` 吃掉目录部分（含 Windows 反斜杠）
 * - `([^/\\]+?)` 非贪婪捕获主干名
 * - `(?:\.(woff2|woff|ttf|otf|eot))?` 可选的字体扩展名
 *
 * 扩展名放在可选项里，分支会先尝试「.ext 结尾」，因此 `My.Font.v2.ttf`
 * 会得到 name = `My.Font.v2`、extension = `ttf`；无扩展名时整段作为 name。
 */
const FONT_PATH_PATTERN = /^(?:.*[/\\])?([^/\\]+?)(?:\.(woff2|woff|ttf|otf|eot))?$/i

/** URL 扩展名 → CSS `format()` 关键字 */
const CSS_FORMAT_TOKENS: Record<string, string> = {
  ttf: 'truetype',
  otf: 'opentype',
  woff: 'woff',
  woff2: 'woff2',
  eot: 'embedded-opentype',
}

/** 去掉 query / hash 并解码，正则只作用在纯路径上，避免 ?redirect=/a/b 干扰 */
function decodeFontPath(url: string): string {
  const path = url.split(/[?#]/, 1)[0]
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** 把任意字符串包成合法的 CSS 字符串（引号、反斜杠、换行都要转义） */
function cssString(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\A ')
  return `"${escaped}"`
}

/** CSS 标识符：保留字母 / 数字 / 下划线 / 连字符 / CJK，其余折叠成连字符 */
function toCssFamily(stem: string): string {
  const safe = stem
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!safe) return 'RemoteFont'
  // CSS 标识符不能直接以数字开头
  return /^\d/.test(safe) ? `font-${safe}` : safe
}

/** 从文件魔数识别真实格式（URL 没有扩展名时仍能拦住 woff2） */
function sniffFormat(bytes: Uint8Array): FontFormat {
  const tag = String.fromCharCode(...bytes.subarray(0, 4))
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'OTTO') return 'otf'
  if (tag === 'true' || tag === 'ttcf' || tag === 'typ1') return 'ttf'
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'ttf'
  return 'unknown'
}

/**
 * 单个在线字体的实体。
 *
 * 职责三件事，全部与环境无关：
 * 1. **名字处理**：从 URL 正则解析出名字 / 扩展名，生成 CSS 安全的 family 与 `@font-face` 规则
 * 2. **加载**：`fetch` → `opentype.parse`，把字节变成内存中的字形表
 * 3. **度量**：对外暴露 `otFont`，排版内核直接读取 ascender / advanceWidth / kerning
 *
 * 因为字形是「应用内数据」而不是「宿主字体系统里的注册项」，所以这里**没有**
 * 浏览器 / node 两套分支：一边是 `FontFace` + `document.fonts`，一边是落盘 +
 * `canvas.registerFont`，那些副作用、注册时序、不可撤销的问题全部消失了。
 */
export class Font {
  /**
   * 静态纯解析：一条正则取出字体名 + 格式，并生成 CSS。
   * 不依赖任何注册表状态，同一个 URL 在任何环境、任何时候结果都一致。
   *
   * @example
   * Font.parse('https://cdn.x.com/Alibaba PuHuiTi-Bold.ttf?v=3')
   * // { name: 'Alibaba PuHuiTi-Bold', family: 'Alibaba-PuHuiTi-Bold',
   * //   extension: 'ttf', format: 'ttf', cssFormat: 'truetype',
   * //   src: 'url("...ttf?v=3") format("truetype")', css: '@font-face { ... }' }
   */
  static parse(url: string, familyOverride?: string): FontURLDescriptor {
    const clean = String(url ?? '').trim()
    const path = decodeFontPath(clean)
    const match = FONT_PATH_PATTERN.exec(path)
    const fileName = path.split(/[\\/]/).pop() ?? ''
    const name = match?.[1] ?? fileName
    const extension = (match?.[2] ?? '').toLowerCase()
    const cssFormat = CSS_FORMAT_TOKENS[extension] ?? ''
    const family = familyOverride ?? toCssFamily(name.trim())
    // 请求地址要保留原始 URL（含 query / hash），不能拿解码后的路径去请求
    const src = clean ? `url(${cssString(clean)})${cssFormat ? ` format(${cssString(cssFormat)})` : ''}` : ''
    const css = clean
      ? ['@font-face {', `  font-family: ${cssString(family)};`, `  src: ${src};`, '  font-display: swap;', '}'].join('\n')
      : ''

    return {
      url: clean,
      fileName,
      name,
      family,
      extension,
      format: (cssFormat ? extension : 'unknown') as FontFormat,
      cssFormat,
      src,
      css,
    }
  }

  readonly descriptor: FontURLDescriptor
  /** 内部记录对象：加载过程中原地更新，保证 load() 返回的引用与注册表一致 */
  private readonly recordInternal: FontRecord
  private task: Promise<FontRecord> | null = null
  private _otFont: OtFont | null = null

  constructor(descriptor: FontURLDescriptor) {
    this.descriptor = descriptor
    this.recordInternal = {
      url: descriptor.url,
      family: descriptor.family,
      format: descriptor.format,
      // Font 一旦被创建就进入加载流程
      status: 'loading',
    }
  }

  get url(): string {
    return this.descriptor.url
  }

  /** 原始名字（未做 CSS 安全化） */
  get name(): string {
    return this.descriptor.name
  }

  get fileName(): string {
    return this.descriptor.fileName
  }

  get family(): string {
    return this.descriptor.family
  }

  get extension(): string {
    return this.descriptor.extension
  }

  get format(): FontFormat {
    return this.descriptor.format
  }

  get cssFormat(): string {
    return this.descriptor.cssFormat
  }

  /** CSS src 值，需要降级到原生 `@font-face` 时可用 */
  get src(): string {
    return this.descriptor.src
  }

  /** 完整 @font-face 规则，导出静态页面时可用 */
  get css(): string {
    return this.descriptor.css
  }

  get status(): FontStatus {
    return this.recordInternal.status
  }

  get error(): string | undefined {
    return this.recordInternal.error
  }

  get loadedAt(): number | undefined {
    return this.recordInternal.loadedAt
  }

  get detail(): string | undefined {
    return this.recordInternal.detail
  }

  get isPending(): boolean {
    return this.task !== null
  }

  get isReady(): boolean {
    return this.status === 'loaded' && this._otFont !== null
  }

  /** 解析好的字形表；未加载完成时为 null */
  get otFont(): OtFont | null {
    return this._otFont
  }

  /** 已解析字形数（加载完成后可读） */
  get numGlyphs(): number {
    return this._otFont?.numGlyphs ?? 0
  }

  /** 返回内部记录（非快照），供 FontManager.load() 直接返回 */
  toRecord(): FontRecord {
    return this.recordInternal
  }

  toCSS(): string {
    return this.css
  }

  /**
   * 下载并解析字体。整个流程只有 fetch + parse，不存在宿主分支。
   * 并发调用共享同一个 Promise；失败后再次调用会重试。
   */
  load(options: FontLoadOptions = {}): Promise<FontRecord> {
    if (this.isReady) return Promise.resolve(this.recordInternal)
    if (this.task) return this.task

    this.recordInternal.status = 'loading'
    delete this.recordInternal.error
    delete this.recordInternal.detail

    this.task = (async () => {
      try {
        const response = await fetch(this.url, { signal: options.signal })
        if (!response.ok) {
          throw new Error(`[font] 下载字体失败 ${this.url}：HTTP ${response.status}`)
        }
        const buffer = await response.arrayBuffer()
        if (buffer.byteLength === 0) throw new Error(`[font] 字体内容为空 ${this.url}`)

        // opentype.js 支持 ttf / otf / woff；woff2 需要 Brotli 解压 + transform 还原，它不做
        const realFormat = this.format === 'unknown' ? sniffFormat(new Uint8Array(buffer.slice(0, 4))) : this.format
        if (realFormat === 'woff2') {
          throw new Error(
            `[font] opentype.js 不支持 woff2：${this.url}。` +
              '请改用 ttf / otf / woff 地址，或在服务端先转码成 ttf。',
          )
        }

        try {
          this._otFont = parseFont(buffer)
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new Error(`[font] 字体解析失败 ${this.url}（格式 ${realFormat}）：${reason}`)
        }

        this.recordInternal.status = 'loaded'
        this.recordInternal.loadedAt = Date.now()
        this.recordInternal.detail = `${this._otFont.numGlyphs} glyphs`
        delete this.recordInternal.error
        return this.recordInternal
      } catch (error) {
        this._otFont = null
        this.recordInternal.status = 'error'
        this.recordInternal.error = error instanceof Error ? error.message : String(error)
        throw error instanceof Error ? error : new Error(String(error))
      } finally {
        this.task = null
      }
    })()

    return this.task
  }

  /**
   * 释放字形表。
   * 纯内存对象，没有全局注册副作用，但 CJK 大字体解析后占内存较多，卸载后需要重新加载。
   */
  dispose(): void {
    this._otFont = null
    this.recordInternal.status = 'loading'
    delete this.recordInternal.loadedAt
    delete this.recordInternal.detail
  }
}
