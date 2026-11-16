import { classRegistry, FabricObject } from '#fabric'
import { Font } from '../../core/font/Font.ts'
import { fontManager } from '../../core/font/manager.ts'
import { layoutText, type LayoutResult, type TextAlign } from './layout.ts'
import type { OtCommand } from '../../core/font/opentype.ts'
import type { FontStatus } from '../../core/font/types.ts'
import type { GlyphRenderMode } from './types.ts'

export interface FontTextOptions {
  /** 在线字体地址；字体族名由 URL 推导，不需要（也不能）手填 fontFamily */
  fontURL: string
  /** 是否在构造时自动开始加载，默认 true */
  autoLoad?: boolean
  /** 字号，默认 24 */
  fontSize?: number
  /** 行高倍数，默认 1.16（与 fabric Text 的默认 lineHeight 一致） */
  lineHeight?: number
  /** 字距（px），CSS letter-spacing 语义 */
  letterSpacing?: number
  /** 对齐方式，默认 left */
  align?: TextAlign
  /** 换行宽度（px）。不传则单行，宽度随内容增长 */
  wrapWidth?: number
  /** 超过整体宽度的长单词是否按字符强制断开，默认 true */
  breakLongWords?: boolean
  /** 字形绘制方式，默认 merged */
  renderMode?: GlyphRenderMode
  /**
   * 字重，与 FabricText 同名字段：'normal' | 'bold' | 'bolder' | 100~900。
   * 只有一个字体文件，所以 >= 600 走假加粗（同色描边外扩）；真要真字重请换 bold 字体文件。
   */
  fontWeight?: string | number
  /** 其余原样透传给 fabric FabricObject（left / top / fill / angle …） */
  [key: string]: unknown
}

export interface FontTextInstance extends FabricObject {
  fontURL: string
  text: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  align: TextAlign
  wrapWidth: number | undefined
  renderMode: GlyphRenderMode
  fontWeight: string | number
  readonly fontStatus: FontStatus | 'unloaded'
  loadFont(): Promise<Font>
  getLayout(): LayoutResult | null
  toPathData(): string
}

/** 把路径命令回放到 ctx 的当前路径上 */
function replayCommands(ctx: CanvasRenderingContext2D, commands: readonly OtCommand[]): void {
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        ctx.moveTo(command.x ?? 0, command.y ?? 0)
        break
      case 'L':
        ctx.lineTo(command.x ?? 0, command.y ?? 0)
        break
      case 'C':
        ctx.bezierCurveTo(
          command.x1 ?? 0,
          command.y1 ?? 0,
          command.x2 ?? 0,
          command.y2 ?? 0,
          command.x ?? 0,
          command.y ?? 0,
        )
        break
      case 'Q':
        ctx.quadraticCurveTo(command.x1 ?? 0, command.y1 ?? 0, command.x ?? 0, command.y ?? 0)
        break
      case 'Z':
        ctx.closePath()
        break
      default:
        break
    }
  }
}

/**
 * 用 opentype 字形路径渲染的文字图层。
 *
 * 结构上对齐 IText：**整段文字仍然是一个 fabric 对象**，文本是字符串，
 * 排版结果缓存成「每行每字形的落点 + 路径命令」，_render 里一次性全部画完，
 * 不会给每个字生成一个 Path 对象（那才是真正的对象爆炸）。
 *
 * 与 IText 的区别只在「怎么画」：IText 把字符串交给 ctx.fillText，由宿主字体系统
 * 负责取字形；这里改成自己从 opentype 的字形表取轮廓、按算好的位置回放成路径。
 * 于是字距、行距、对齐、填充/描边、后续的变形加粗全都可控，也不再依赖宿主装没装字体。
 *
 * 这里直接声明 class，不在运行时注入 fabric 基类。fabric / fabric/node 是两份 bundle，
 * 二者的区分交给模块解析（package.json 的 imports.#fabric 与各端打包配置），
 * 代码本身与环境无关。
 */
export class FontText extends FabricObject {
  static type = 'FontText'
  /** 进序列化：文本内容 + 排版参数 */
  static customProperties = [
    'fontURL',
    'text',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'align',
    'wrapWidth',
    'breakLongWords',
    'renderMode',
    'fontWeight',
  ]
  /** 进撤销/重做状态快照 */
  static stateProperties = [
    ...(FabricObject.stateProperties ?? []),
    'fontURL',
    'text',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'align',
    'wrapWidth',
    'breakLongWords',
    'renderMode',
    'fontWeight',
  ]

  /* ------------------------------ 内部状态 ------------------------------ */

  /** 构造完成前（super() 期间）不响应属性变化，避免拿不到字段 */
  private _active = false
  private _url = ''
  private _text = ''
  private _fontSize = 24
  private _lineHeight: number | undefined
  private _letterSpacing = 0
  private _align: TextAlign = 'left'
  private _wrapWidth: number | undefined
  private _breakLongWords = true
  private _renderMode: GlyphRenderMode = 'merged'
  private _fontWeight: string | number = 'normal'
  private _autoLoad = true
  private _font: Font | null = null
  private _fontTask: Promise<Font> | null = null
  /** 最近一次失败原因：实体不存错误，视图层要一个 error 状态就只能自己记 */
  private _fontError: Error | null = null
  /** 排版缓存：文字 / 字体 / 字号变化时丢弃 */
  private _layout: LayoutResult | null = null

  constructor(
    textOrOptions: string | (FontTextOptions & { text?: string }),
    options: FontTextOptions = {} as FontTextOptions,
  ) {
    const isObjectForm = typeof textOrOptions === 'object' && textOrOptions !== null
    const source = (isObjectForm ? textOrOptions : options) as FontTextOptions & { text?: string }
    const text = isObjectForm ? (textOrOptions.text ?? '') : textOrOptions

    const {
      fontURL,
      autoLoad = true,
      fontSize,
      lineHeight,
      letterSpacing,
      align,
      wrapWidth,
      breakLongWords,
      renderMode,
      fontWeight,
      text: _ignoredText,
      ...rest
    } = source
    void _ignoredText

    // objectCaching：整段文字缓存在离屏画布上，拖动 / 缩放时不会重放几万条路径命令
    super({ objectCaching: true, ...rest })

    this._url = String(fontURL ?? '').trim()
    this._text = String(text ?? '')
    this._autoLoad = autoLoad
    if (fontSize !== undefined) this._fontSize = fontSize
    if (lineHeight !== undefined) this._lineHeight = lineHeight
    if (letterSpacing !== undefined) this._letterSpacing = letterSpacing
    if (align !== undefined) this._align = align
    if (wrapWidth !== undefined) this._wrapWidth = wrapWidth
    if (breakLongWords !== undefined) this._breakLongWords = breakLongWords
    if (renderMode !== undefined) this._renderMode = renderMode
    if (fontWeight !== undefined) this._fontWeight = fontWeight

    this._active = true
    this.re_layout()

    if (this._url && this._autoLoad) {
      void this.loadFont().catch(() => {
        // 失败信息已经记录在 FontManager / Font 里，避免未处理的 rejection
      })
    }
  }

  /* ------------------------------- 属性 ------------------------------- */

  get fontURL(): string {
    return this._url
  }

  set fontURL(value: string) {
    const next = String(value ?? '').trim()
    if (next === this._url) return
    this._url = next
    this._font = null
    this._fontTask = null
    this._fontError = null
    this.onLayoutInputsChanged()
    if (next && this._autoLoad) {
      void this.loadFont().catch(() => undefined)
    }
  }

  get text(): string {
    return this._text
  }

  set text(value: string) {
    const next = value == null ? '' : String(value)
    if (next === this._text) return
    this._text = next
    this.onLayoutInputsChanged()
  }

  get fontSize(): number {
    return this._fontSize
  }

  set fontSize(value: number) {
    const next = Number(value)
    if (!Number.isFinite(next) || next <= 0 || next === this._fontSize) return
    this._fontSize = next
    this.onLayoutInputsChanged()
  }

  get lineHeight(): number | undefined {
    return this._lineHeight
  }

  set lineHeight(value: number | undefined) {
    const next = value === undefined || value === null ? undefined : Number(value)
    if (next === this._lineHeight) return
    this._lineHeight = next
    this.onLayoutInputsChanged()
  }

  get letterSpacing(): number {
    return this._letterSpacing
  }

  set letterSpacing(value: number) {
    const next = Number(value) || 0
    if (next === this._letterSpacing) return
    this._letterSpacing = next
    this.onLayoutInputsChanged()
  }

  get align(): TextAlign {
    return this._align
  }

  set align(value: TextAlign) {
    if (value === this._align) return
    this._align = value
    this.onLayoutInputsChanged()
  }

  get wrapWidth(): number | undefined {
    return this._wrapWidth
  }

  set wrapWidth(value: number | undefined) {
    const next = value === undefined || value === null ? undefined : Number(value)
    const normalized = next !== undefined && (!Number.isFinite(next) || next <= 0) ? undefined : next
    if (normalized === this._wrapWidth) return
    this._wrapWidth = normalized
    this.onLayoutInputsChanged()
  }

  get breakLongWords(): boolean {
    return this._breakLongWords
  }

  set breakLongWords(value: boolean) {
    const next = Boolean(value)
    if (next === this._breakLongWords) return
    this._breakLongWords = next
    this.onLayoutInputsChanged()
  }

  get renderMode(): GlyphRenderMode {
    return this._renderMode
  }

  set renderMode(value: GlyphRenderMode) {
    if (value === this._renderMode) return
    this._renderMode = value
    this.dirty = true
    this.canvas?.requestRenderAll()
  }

  /** 字重，语义与 FabricText 一致；只影响绘制，不改排版宽度 */
  get fontWeight(): string | number {
    return this._fontWeight
  }

  set fontWeight(value: string | number) {
    const next = value ?? 'normal'
    if (next === this._fontWeight) return
    this._fontWeight = next
    this.dirty = true
    this.canvas?.requestRenderAll()
  }

  /** 'bolder' / 'bold' / >= 600 都按粗体处理（只有一个字体文件，所以是假加粗） */
  private get isBold(): boolean {
    const weight = this._fontWeight
    if (typeof weight === 'number') return weight >= 600
    const value = String(weight).trim().toLowerCase()
    if (value === 'bold' || value === 'bolder') return true
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric >= 600
  }

  get fontStatus(): FontStatus | 'unloaded' {
    if (this._font) return 'loaded'
    if (this._fontTask) return 'loading'
    return this._fontError ? 'error' : 'unloaded'
  }

  /* ------------------------------- 排版 ------------------------------- */

  getLayout(): LayoutResult | null {
    return this._layout
  }

  /** 导出整段文字合并后的 path data（转曲 / 给 SVG 用） */
  toPathData(): string {
    return this._layout?.pathData ?? ''
  }

  /**
   * 重新排版并同步尺寸。
   * IText 的 `initDimensions()` 是同一角色：宽度 / 高度由内容推导，写回 width / height。
   */
  initDimensions(): void {
    this.re_layout()
  }

  private re_layout(): void {
    const otFont = this._font?.otFont ?? null
    if (!otFont) {
      // 字体没就绪：先给一个可用的估算尺寸，保证选框 / 布局不塌陷
      this._layout = null
      this.width = this._wrapWidth ?? Math.max(this._fontSize, this._text.length * this._fontSize * 0.6)
      this.height = (this._lineHeight ?? 1.2) * this._fontSize
      this.dirty = true
      this.setCoords()
      return
    }

    const layout = layoutText(otFont, this._text, {
      fontSize: this._fontSize,
      lineHeight: this._lineHeight,
      letterSpacing: this._letterSpacing,
      align: this._align,
      maxWidth: this._wrapWidth,
      breakLongWords: this._breakLongWords,
    })
    this._layout = layout
    // width 是「换行宽度与内容宽度的较大者」，之后再加字也不会被内容宽度反向当成换行宽度
    this.width = layout.width
    this.height = layout.height
    this.dirty = true
    this.setCoords()
    this.canvas?.requestRenderAll()
  }

  private onLayoutInputsChanged(): void {
    if (!this._active) return
    this.re_layout()
  }

  /* ------------------------------- 加载 ------------------------------- */

  /** 显式等待字体就绪；多次调用共享同一个 Promise，失败后可重试 */
  loadFont(): Promise<Font> {
    if (!this._url) return Promise.reject(new Error('[font] fontURL 为空'))
    if (!this._fontTask) {
      // 名字由 URL 推导，和 FontManager 的缓存 key / CSS family 保持一致
      const name = Font.parse(this._url).family
      this._fontError = null
      this._fontTask = fontManager
        .get({ url: this._url, name })
        .then((font) => {
          this._font = font
          this.re_layout()
            ; (this as unknown as {
              fire(name: string, options?: Record<string, unknown>): void
            }).fire('font:loaded', { url: font.url, family: font.family })
          return font
        })
        .catch((error: unknown) => {
          this._fontTask = null
          this._fontError = error instanceof Error ? error : new Error(String(error))
          throw error
        })
    }
    return this._fontTask
  }

  /* ------------------------------- 渲染 ------------------------------- */

  /**
   * 只负责「铺字」，不做任何对象拆分。
   *
   * 坐标约定与 fabric 其它图元一致：进入 `_render` 时原点是对象中心，
   * 所以先平移半个宽高，之后所有落点都按「左上角为原点」的排版坐标直接画。
   */
  _render(ctx: CanvasRenderingContext2D): void {
    const layout = this._layout
    if (!layout || this.width <= 0 || this.height <= 0) return

    ctx.save()
    ctx.translate(-this.width / 2, -this.height / 2)

    if (this._renderMode === 'glyph') {
      // 每个字形单独起一条路径：字形相交时不会被 nonzero 规则互相抵消
      for (const placed of layout.glyphs) {
        if (!placed.commands.length) continue
        ctx.beginPath()
        replayCommands(ctx, placed.commands)
        this.paint(ctx)
      }
    } else {
      // 合并成一条路径、一次 fill：调用最少，绝大多数正体字体没问题
      ctx.beginPath()
      for (const placed of layout.glyphs) replayCommands(ctx, placed.commands)
      this.paint(ctx)
    }

    ctx.restore()
  }

  /**
   * 填充当前路径。
   *
   * 假加粗没有真正的 bold 字形，就把 outline 当描边再描一遍：
   * 临时把 stroke 借成 fill、lineWidth 取 0.03em，画完立刻还原，
   * 这样不会污染对象自身的 stroke / strokeWidth，也不会进序列化。
   */
  private paint(ctx: CanvasRenderingContext2D): void {
    if (!this.isBold || !this.fill) {
      this._renderPaintInOrder(ctx)
      return
    }

    const stroke = this.stroke
    const strokeWidth = this.strokeWidth
    const strokeLineJoin = this.strokeLineJoin

    this.stroke = this.fill
    this.strokeWidth = this.fontSize * 0.03
    this.strokeLineJoin = 'round'
    this._renderPaintInOrder(ctx)

    this.stroke = stroke
    this.strokeWidth = strokeWidth
    this.strokeLineJoin = strokeLineJoin
  }

  /* ----------------------------- 序列化 ----------------------------- */

  static async fromObject(object: Record<string, unknown>): Promise<FontText> {
    const { text = '', type: _type, version: _version, ...rest } = object
    void _type
    void _version
    return new FontText(String(text), rest as FontTextOptions)
  }
}

classRegistry.setClass(FontText)
