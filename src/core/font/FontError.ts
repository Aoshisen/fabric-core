/** 字体加载 / 解析失败的原因分类 */
export type FontErrorCode =
  /** fetch 本身失败（网络、CORS、DNS、被 abort） */
  | 'network'
  /** HTTP 状态码非 2xx */
  | 'http'
  /** 响应体为空 */
  | 'empty'
  /** 格式不支持（当前是 woff2，opentype.js 解不了） */
  | 'unsupported-format'
  /** 字节解析失败（文件损坏 / 不是字体） */
  | 'parse'

/**
 * 字体加载的唯一错误类型。
 *
 * 'Font.load()' 失败时 reject 的就是它，状态与原因都从错误对象上读，
 * 实体内部不再单独保存 error 字符串。
 */
export class FontError extends Error {
  readonly code: FontErrorCode
  readonly url: string
  /** code 为 'http' 时对应的状态码 */
  readonly status?: number

  constructor(code: FontErrorCode, url: string, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'FontError'
    this.code = code
    this.url = url
    this.status = options.status
  }
}
