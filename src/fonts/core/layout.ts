/**
 * 排版内核：只吃 opentype 的字形数据，自己算行、自己算间距，产出**路径命令**。
 *
 * 与 canvas `fillText` 的区别：
 * - 完全不依赖宿主是否注册过字体，浏览器 / node 结果一致
 * - 每个字形的落点和宽度都可读可改，字距 / 行距 / 对齐 / 变形都能自己控制
 * - 换行、禁则、断词全部在这里处理，不经过 `ctx.measureText`
 */
import type { OtCommand, OtFont, OtGlyph } from './opentype.ts'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export interface LayoutOptions {
  fontSize: number
  /** 有值时开启自动换行；不传则单行 */
  maxWidth?: number
  /** 每个字符后追加的额外间距（px），CSS letter-spacing 语义 */
  letterSpacing?: number
  /** 行高（fontSize 的倍数），默认取字体 ascender - descender + lineGap */
  lineHeight?: number
  align?: TextAlign
  /** 单个词超过整体宽度时是否按字符强制断开 */
  breakLongWords?: boolean
}

export interface PlacedGlyph {
  char: string
  glyph: OtGlyph
  /** 相对排版原点（左上角）的落点，y 是基线 */
  x: number
  y: number
  advance: number
  lineIndex: number
  /** 在原始 text 中的字符下标 */
  charIndex: number
  /** 该字形的路径命令（按落点算好，渲染时直接回放） */
  commands: OtCommand[]
}

export interface LayoutLine {
  text: string
  glyphs: PlacedGlyph[]
  /** 该行真实占宽（含字距，不含对齐产生的额外空隙） */
  width: number
  baselineY: number
  startIndex: number
  endIndex: number
  /** 对齐后相对原点的水平偏移 */
  offsetX: number
}

export interface LayoutResult {
  lines: LayoutLine[]
  glyphs: PlacedGlyph[]
  /** 合并后的 SVG path data，导出 / 调试用 */
  pathData: string
  width: number
  height: number
  ascent: number
  descent: number
  lineHeight: number
  fontSize: number
}

/* ---------------------------------- 字符分类 --------------------------------- */

/** 行首禁则：这些字符不能出现在行首 */
const CLOSING_PUNCT = new Set('，。、；：？！）】」』》〉…·,.;:?!)]}%”’')
/** 行尾禁则：这些字符不能出现在行尾 */
const OPENING_PUNCT = new Set('（【「『《〈([{“‘')

type ClusterKind = 'space' | 'word' | 'char'

interface Cluster {
  text: string
  kind: ClusterKind
}

/**
 * 断行单元：空白 / 一整段拉丁词 / 单个 CJK 字符（含全角标点）。
 * 拉丁词整体不可分割，CJK 逐字都可作为断点。
 */
function tokenize(text: string): Cluster[] {
  const clusters: Cluster[] = []
  const pattern = /(\s+)|([^\s\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]+)|([\s\S])/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match[1]) clusters.push({ text: match[1], kind: 'space' })
    else if (match[2]) clusters.push({ text: match[2], kind: 'word' })
    else clusters.push({ text: match[3], kind: 'char' })
  }
  return clusters
}

function canBreakBefore(prev: Cluster | undefined, next: Cluster): boolean {
  if (!prev) return false
  if (next.kind === 'space') return false
  // 行首禁则
  if (CLOSING_PUNCT.has(next.text[0])) return false
  // 行尾禁则
  if (OPENING_PUNCT.has(prev.text[prev.text.length - 1])) return false
  if (prev.kind === 'space') return true
  if (prev.kind === 'char' || next.kind === 'char') return true
  return false
}

/* ---------------------------------- 度量 ---------------------------------- */

interface RunMetrics {
  width: number
  lastGlyph: OtGlyph | null
}

/**
 * 逐字累加 advance + kerning + letterSpacing。
 * `prev` 用于跨 cluster 的 kerning，同一行内必须连续传递。
 */
function measureRun(
  font: OtFont,
  text: string,
  fontSize: number,
  letterSpacing: number,
  prev: OtGlyph | null = null,
): RunMetrics {
  const scale = fontSize / font.unitsPerEm
  let width = 0
  let last = prev
  for (const char of text) {
    const glyph = font.charToGlyph(char)
    if (last) width += font.getKerningValue(last, glyph) * scale
    width += (glyph.advanceWidth ?? 0) * scale + letterSpacing
    last = glyph
  }
  return { width, lastGlyph: last }
}

/* ---------------------------------- 断行 ---------------------------------- */

interface RawLine {
  clusters: Cluster[]
  width: number
  /** 行尾空白悬挂，不计入宽度 */
  hangingSpace: boolean
}

function buildLines(font: OtFont, text: string, options: LayoutOptions): RawLine[] {
  const { fontSize, letterSpacing = 0, maxWidth, breakLongWords = true } = options
  const clusters = tokenize(text)
  const limit = maxWidth && maxWidth > 0 ? maxWidth : Number.POSITIVE_INFINITY

  const lines: RawLine[] = []
  let current: Cluster[] = []
  let currentWidth = 0
  let lastGlyph: OtGlyph | null = null

  const flush = (hangingSpace: boolean) => {
    let width = currentWidth
    if (hangingSpace) {
      const tail = current[current.length - 1]
      width -= measureRun(font, tail.text, fontSize, letterSpacing).width
    }
    lines.push({ clusters: current, width, hangingSpace })
    current = []
    currentWidth = 0
    lastGlyph = null
  }

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    const metrics = measureRun(font, cluster.text, fontSize, letterSpacing, lastGlyph)

    // 行首不放空白
    if (current.length === 0 && cluster.kind === 'space') continue

    if (current.length > 0 && canBreakBefore(clusters[i - 1], cluster) && currentWidth + metrics.width > limit) {
      flush(current[current.length - 1].kind === 'space')
      if (cluster.kind === 'space') continue
    }

    // 单个单元本身超宽：按字符强制拆开
    if (current.length === 0 && metrics.width > limit && breakLongWords && cluster.text.length > 1) {
      let chunk = ''
      let chunkWidth = 0
      let chunkLast: OtGlyph | null = null
      for (const char of cluster.text) {
        const single = measureRun(font, char, fontSize, letterSpacing, chunkLast)
        if (chunk && chunkWidth + single.width > limit) {
          lines.push({ clusters: [{ text: chunk, kind: 'word' }], width: chunkWidth, hangingSpace: false })
          chunk = ''
          chunkWidth = 0
          chunkLast = null
        }
        const added = measureRun(font, char, fontSize, letterSpacing, chunkLast)
        chunk += char
        chunkWidth += added.width
        chunkLast = added.lastGlyph
      }
      if (chunk) {
        current = [{ text: chunk, kind: 'word' }]
        currentWidth = chunkWidth
        lastGlyph = chunkLast
      }
      continue
    }

    current.push(cluster)
    currentWidth += metrics.width
    lastGlyph = metrics.lastGlyph
  }

  if (current.length || lines.length === 0) {
    flush(current.length > 0 && current[current.length - 1].kind === 'space')
  }
  return lines
}

/* ---------------------------------- 排布 ---------------------------------- */

function placeLine(
  font: OtFont,
  line: RawLine,
  lineIndex: number,
  startIndex: number,
  fontSize: number,
  letterSpacing: number,
  baselineY: number,
): LayoutLine {
  const scale = fontSize / font.unitsPerEm
  const glyphs: PlacedGlyph[] = []
  let cursor = 0
  let last: OtGlyph | null = null
  let charIndex = startIndex
  let text = ''

  for (const cluster of line.clusters) {
    for (const char of cluster.text) {
      const glyph = font.charToGlyph(char)
      if (last) cursor += font.getKerningValue(last, glyph) * scale
      const advance = (glyph.advanceWidth ?? 0) * scale + letterSpacing
      glyphs.push({ char, glyph, x: cursor, y: baselineY, advance, lineIndex, charIndex, commands: [] })
      cursor += advance
      last = glyph
      charIndex += 1
      text += char
    }
  }

  return {
    text,
    glyphs,
    width: line.width,
    baselineY,
    startIndex,
    endIndex: charIndex,
    offsetX: 0,
  }
}

function applyAlignment(lines: LayoutLine[], contentWidth: number, align: TextAlign, maxWidth: number): void {
  const container = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : contentWidth
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (align === 'center') {
      line.offsetX = (container - line.width) / 2
    } else if (align === 'right') {
      line.offsetX = container - line.width
    } else if (align === 'justify') {
      if (i === lines.length - 1 || line.glyphs.length < 2) continue
      const extra = container - line.width
      if (extra <= 0) continue
      const gaps = line.glyphs.length - 1
      const step = extra / gaps
      for (let g = 1; g < line.glyphs.length; g++) line.glyphs[g].x += step * g
      line.width = container
    }
  }
}

/* ---------------------------------- 路径 ---------------------------------- */

function commandToString(command: OtCommand, precision: number): string {
  const n = (value: number | undefined) => {
    if (value === undefined) return '0'
    return String(Number(value.toFixed(precision)))
  }
  switch (command.type) {
    case 'M':
      return `M${n(command.x)} ${n(command.y)}`
    case 'L':
      return `L${n(command.x)} ${n(command.y)}`
    case 'C':
      return `C${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}`
    case 'Q':
      return `Q${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}`
    case 'Z':
      return 'Z'
    default:
      return ''
  }
}

/**
 * 把每个字形转成路径命令，并顺便拼出合并后的 path data。
 * 字形的命令存在 `PlacedGlyph.commands` 上，渲染时直接回放，不用再解析字符串。
 */
function buildGlyphPaths(glyphs: PlacedGlyph[], fontSize: number, precision: number): string {
  let pathData = ''
  for (const placed of glyphs) {
    // 空白字形没有轮廓，跳过（间距已经体现在 x 上）
    if (!placed.char.trim()) continue
    const glyphPath = placed.glyph.getPath(placed.x, placed.y, fontSize)
    placed.commands = glyphPath.commands
    for (const command of glyphPath.commands) pathData += commandToString(command, precision)
  }
  return pathData
}

/* ---------------------------------- 入口 ---------------------------------- */

export function layoutText(font: OtFont, text: string, options: LayoutOptions): LayoutResult {
  const fontSize = Math.max(1, options.fontSize)
  const letterSpacing = options.letterSpacing ?? 0
  const scale = fontSize / font.unitsPerEm
  const ascent = font.ascender * scale
  const descent = Math.abs(font.descender) * scale
  const lineGap = (font.tables.hhea?.lineGap ?? 0) * scale
  const lineHeight = options.lineHeight ? options.lineHeight * fontSize : ascent + descent + lineGap
  const align = options.align ?? 'left'
  const maxWidth = options.maxWidth && options.maxWidth > 0 ? options.maxWidth : Number.POSITIVE_INFINITY

  const rawLines = buildLines(font, text, { ...options, maxWidth: Number.isFinite(maxWidth) ? maxWidth : undefined })

  const lines: LayoutLine[] = []
  let charCursor = 0
  for (let i = 0; i < rawLines.length; i++) {
    const line = placeLine(font, rawLines[i], i, charCursor, fontSize, letterSpacing, ascent + i * lineHeight)
    charCursor = line.endIndex
    lines.push(line)
  }

  const contentWidth = lines.reduce((max, line) => Math.max(max, line.width), 0)
  applyAlignment(lines, contentWidth, align, maxWidth)

  const glyphs: PlacedGlyph[] = []
  for (const line of lines) {
    for (const glyph of line.glyphs) {
      glyph.x += line.offsetX
      glyphs.push(glyph)
    }
  }

  const pathData = buildGlyphPaths(glyphs, fontSize, 2)

  return {
    lines,
    glyphs,
    pathData,
    width: Number.isFinite(maxWidth) ? Math.max(maxWidth, contentWidth) : contentWidth,
    height: lines.length * lineHeight,
    ascent,
    descent,
    lineHeight,
    fontSize,
  }
}
