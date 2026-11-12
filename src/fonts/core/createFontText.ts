import type { FabricObject } from 'fabric'
import type { FontManager } from './FontManager.ts'
import { layoutText, type LayoutResult, type TextAlign } from './layout.ts'
import type { OtCommand } from './opentype.ts'
import type { FontFabricApi, FontRecord, FontStatus, GlyphRenderMode } from './types.ts'

export interface FontTextOptions {
  /** 在线字体地址；字体族名由 URL 推导，不需要（也不能）手填 fontFamily */
  fontURL: string
  /** 是否在构造时自动开始加载，默认 true */
  autoLoad?: boolean
  /** 字号，默认 24 */
  fontSize?: number
  /** 行高倍数，默认取字体 ascender - descender + lineGap */
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
  readonly fontStatus: FontStatus | 'unloaded'
  loadFont(): Promise<FontRecord>
  getLayout(): LayoutResult | null
  toPathData(): string
}

export interface CreateFontTextOptions {
  /** 由入口注入：浏览器给 fabric，node 给 fabric/node，两者是不同的 bundle */
  fabric: FontFabricApi
  manager: FontManager
}

type FabricObjectCtor = new (options?: Record<string, unknown>) => FabricObject

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
 * 生成自定义文字图层类。
 *
 * 结构上对齐 IText：**整段文字仍然是一个 fabric 对象**，`text` 是字符串，
 * 排版结果缓存成「每行每字形的落点 + 路径命令」，`_render` 里一次性全部画完，
 * 不会给每个字生成一个 Path 对象（那才是真正的对象爆炸）。
 *
 * 与 IText 的区别只在「怎么画」：IText 把字符串交给 `ctx.fillText`，由宿主字体系统
 * 负责取字形；这里改成自己从 opentype 的字形表取轮廓、按算好的位置回放成路径。
 * 于是字距、行距、对齐、填充/描边、后续的变形加粗全都可控，也不再依赖宿主装没装字体。
 *
 * 用工厂而不是直接 class 的原因和之前一样：fabric 与 fabric/node 是两份 bundle，
 * classRegistry 各一份，两端必须各自用自己那份基类并注册到自己那份 registry。
 */
export function createFontText({ fabric, manager }: CreateFontTextOptions) {
  const Base = fabric.FabricObject as unknown as FabricObjectCtor & {
    stateProperties?: string[]
  }

  class FontText extends Base {
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
    ]
    /** 进撤销/重做状态快照 */
    static stateProperties = [
      ...(Base.stateProperties ?? []),
      'fontURL',
      'text',
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'align',
      'wrapWidth',
      'breakLongWords',
      'renderMode',
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
    private _autoLoad = true
    private _fontTask: Promise<FontRecord> | null = null
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

      this._active = true
      this.relayout()

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
      this._fontTask = null
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

    get fontStatus(): FontStatus | 'unloaded' {
      return manager.get(this._url)?.status ?? 'unloaded'
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
      this.relayout()
    }

    private relayout(): void {
      const otFont = manager.getFont(this._url)?.otFont ?? null
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
      this.relayout()
    }

    /* ------------------------------- 加载 ------------------------------- */

    /** 显式等待字体就绪；多次调用共享同一个 Promise，失败后可重试 */
    loadFont(): Promise<FontRecord> {
      if (!this._url) return Promise.reject(new Error('[font] fontURL 为空'))
      if (!this._fontTask) {
        this._fontTask = manager
          .load(this._url)
          .then((record) => {
            this.relayout()
            ;(this as unknown as {
              fire(name: string, options?: Record<string, unknown>): void
            }).fire('font:loaded', { url: record.url, family: record.family })
            return record
          })
          .catch((error: unknown) => {
            this._fontTask = null
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
          this._renderPaintInOrder(ctx)
        }
      } else {
        // 合并成一条路径、一次 fill：调用最少，绝大多数正体字体没问题
        ctx.beginPath()
        for (const placed of layout.glyphs) replayCommands(ctx, placed.commands)
        this._renderPaintInOrder(ctx)
      }

      ctx.restore()
    }

    /* ----------------------------- 序列化 ----------------------------- */

    static async fromObject(object: Record<string, unknown>): Promise<FontText> {
      const { text = '', type: _type, version: _version, ...rest } = object
      void _type
      void _version
      return new FontText(String(text), rest as FontTextOptions)
    }
  }

  // setClass 同时注册 'FontText' 与小写别名，enlivenObjects 才能找回这个类
  fabric.classRegistry.setClass(FontText)

  return FontText as unknown as {
    new (text: string, options: FontTextOptions): FontTextInstance
    new (options: FontTextOptions & { text?: string }): FontTextInstance
    readonly type: string
    fromObject(object: Record<string, unknown>): Promise<FontTextInstance>
  }
}
