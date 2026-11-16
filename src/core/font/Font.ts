import { to } from 'await-to-js'
import { loadFontRuntime } from '#font-runtime'
import { FontError } from './FontError.ts'
import type { FontFormat, FontStatus, FontURLDescriptor } from './types.ts'

/**
 * 一条正则，一次匹配同时取出「文件名主干」与「字体扩展名」。
 *
 * - `(?:.*[/\\])?` 吃掉目录部分（含 Windows 反斜杠）
 * - `([^/\\]+?)` 非贪婪捕获主干名
 * - `(?:\.(woff2|woff|ttf|otf|eot))?` 可选的字体扩展名
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
  return /^\d/.test(safe) ? `font-${safe}` : safe
}

/**
 * 单个在线字体的实体。
 *
 * 只做两件事：
 * 1. 从 URL 解析出名字 / 格式，生成 `@font-face` 规则（纯字符串处理）
 * 2. 用浏览器的 `FontFace` API 加载，加载完注册进 `document.fonts`
 */
export class Font {
  /**
   * 静态纯解析：不依赖任何注册表状态，同一个 URL 任何时候结果都一致。
   *
   * @example
   * Font.parse('https://cdn.x.com/Alibaba PuHuiTi-Bold.ttf?v=3')
   * // { name: 'Alibaba PuHuiTi-Bold', family: 'Alibaba-PuHuiTi-Bold', ... }
   */
  static parse(url: string, familyOverride?: string): FontURLDescriptor {
    const clean = String(url ?? '').trim()
    const path = decodeFontPath(clean)
    const match = FONT_PATH_PATTERN.exec(path)
    const fileName = path.split(/[\\\\/]/).pop() ?? ''
    const name = match?.[1] ?? fileName
    const extension = (match?.[2] ?? '').toLowerCase()
    const cssFormat = CSS_FORMAT_TOKENS[extension] ?? ''
    const family = familyOverride ?? toCssFamily(name.trim())
    // 请求地址要保留原始 URL（含 query / hash）
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
  /** 唯一状态源：注册成功 → loaded，失败 reject 成 FontError */
  private task: Promise<void> | null = null
  private _loaded = false

  constructor(descriptor: FontURLDescriptor) {
    this.descriptor = descriptor
  }

  get url(): string {
    return this.descriptor.url
  }

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

  /** CSS src 值，注入 `@font-face` 时用 */
  get src(): string {
    return this.descriptor.src
  }

  /** 完整 @font-face 规则 */
  get css(): string {
    return this.descriptor.css
  }

  /** 状态视图：已注册 → loaded；加载中 → loading；其余 → error */
  get status(): FontStatus {
    if (this._loaded) return 'loaded'
    return this.task ? 'loading' : 'error'
  }

  get isPending(): boolean {
    return this.task !== null
  }

  get isReady(): boolean {
    return this._loaded
  }

  toCSS(): string {
    return this.css
  }

  /**
   * 注册字体：浏览器走 FontFace，node 走 node-canvas registerFont，
   * 具体实现由 package.json 的 imports.#font-runtime 在解析阶段决定。
   * 并发共享 Promise，失败后再次调用即重试。
   */
  load(): Promise<void> {
    if (this._loaded) return Promise.resolve()
    this.task ??= this.run()
    return this.task
  }

  private async run(): Promise<void> {
    const [error] = await to(loadFontRuntime(this.descriptor, this.family))
    this.task = null
    if (error) {
      throw new FontError('load', this.url, `[font] 字体加载失败 ${this.url}：${error.message}`, { cause: error })
    }
    this._loaded = true
  }

  dispose(): void {
    this._loaded = false
    this.task = null
  }
}