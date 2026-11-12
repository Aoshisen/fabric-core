/**
 * opentype.js 的薄封装：只做「导出形态互操作 + 类型收敛」。
 *
 * 必须处理的一个坑：opentype.js 2.0 的 CJS 产物（node 走 `main`）有 default 导出，
 * 而 ESM 产物（Vite / 浏览器走 `module`）**没有 default**，只有命名导出。
 * 这里统一取到 `parse`，调用方不需要关心环境。
 */
import * as OpentypeModule from 'opentype.js'

export interface OtCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

export interface OtPath {
  commands: OtCommand[]
  toPathData(precision?: number): string
  getBoundingBox(): { x1: number; y1: number; x2: number; y2: number }
}

export interface OtGlyph {
  index: number
  name?: string
  advanceWidth?: number
  getPath(x: number, y: number, fontSize: number, options?: unknown): OtPath
}

export interface OtFont {
  unitsPerEm: number
  ascender: number
  descender: number
  numGlyphs: number
  tables: { hhea?: { lineGap?: number } }
  charToGlyph(char: string): OtGlyph
  stringToGlyphs(text: string): OtGlyph[]
  getKerningValue(left: OtGlyph, right: OtGlyph): number
  getAdvanceWidth(text: string, fontSize: number): number
  getPath(text: string, x: number, y: number, fontSize: number, options?: unknown): OtPath
}

type ParseFn = (buffer: ArrayBuffer, options?: Record<string, unknown>) => OtFont

const moduleRecord = OpentypeModule as unknown as {
  parse?: ParseFn
  default?: { parse?: ParseFn }
}

const parseImpl: ParseFn | undefined = moduleRecord.parse ?? moduleRecord.default?.parse

/** 把字体字节解析成 opentype Font（纯内存操作，无任何宿主副作用） */
export function parseFont(buffer: ArrayBuffer): OtFont {
  if (!parseImpl) throw new Error('[font] 无法从 opentype.js 取得 parse 导出')
  return parseImpl(buffer)
}
