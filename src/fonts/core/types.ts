/**
 * 字体模块的环境无关类型定义。
 * 这一层不允许 import 任何浏览器或 node 的运行时 API。
 */

export type FontRuntime = 'browser' | 'node'

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2' | 'unknown'

export interface FontLoadRequest {
  /** 在线字体地址 */
  url: string
  /** 由 URL 推导出来、并经 manager 去重后的字体族名 */
  family: string
  format: FontFormat
  signal?: AbortSignal
}

export interface FontLoadResult {
  /** 释放该字体占用的资源（浏览器端可从 document.fonts 移除） */
  dispose?: () => void | Promise<void>
  /** 驱动附加信息，例如 node 端落盘的缓存路径 */
  detail?: string
}

/** 浏览器 / node 各实现一份，注入给 FontManager */
export interface FontDriver {
  readonly runtime: FontRuntime
  load(request: FontLoadRequest): Promise<FontLoadResult>
}

export type FontStatus = 'loading' | 'loaded' | 'error'

export interface FontRecord {
  url: string
  family: string
  format: FontFormat
  runtime: FontRuntime
  status: FontStatus
  loadedAt?: number
  error?: string
  detail?: string
  dispose?: () => void | Promise<void>
}

export type FontManagerListener = (records: readonly FontRecord[]) => void

/** createFontTextBox 需要的最小 fabric 能力集（两端各自注入自己的 bundle） */
export interface FontFabricApi {
  Textbox: typeof import('fabric').Textbox
  classRegistry: Pick<
    typeof import('fabric').classRegistry,
    'setClass' | 'has' | 'getClass'
  >
}
