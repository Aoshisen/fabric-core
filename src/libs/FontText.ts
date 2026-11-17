import { classRegistry, Textbox } from '#fabric'
import { fontManager } from '../font/manager.ts'

/** 字体加载状态（视图用） */
export type FontTextStatus = 'unloaded' | 'loading' | 'loaded' | 'error'

/** 字体来源：name 既是 CSS font-family，也是加载层里的缓存 key */
export interface FontSource {
  name: string
  url: string
}

export interface FontTextOptions {
  /** 字体（名字 + 地址）；也可以构造后再赋值 `text.font = { name, url }` */
  font?: FontSource | null
  /** 是否构造时自动加载，默认 true */
  autoLoad?: boolean
  /** 其余原样透传给 Textbox */
  [key: string]: unknown
}

function normalizeFont(font: FontSource): FontSource {
  const name = String(font.name ?? '').trim()
  const url = String(font.url ?? '').trim()
  if (!name) throw new Error('[font] name 不能为空')
  if (!url) throw new Error('[font] url 不能为空')
  return { name, url }
}

/**
 * 直接用 fabric 的 Textbox 渲染的文字图层。
 *
 * 只做一件事：把 `font = { name, url }` 交给加载层注册，
 * 就绪后交给 Textbox 的 ctx.fillText。换行、对齐、字距、光标、选区、
 * IME、缩放、序列化全部是 fabric 原生行为。
 */
export class FontText extends Textbox {
  static type = 'FontText'
  /** font 进序列化（Textbox 自己的成员已经在父类 customProperties 里） */
  static customProperties = [...(Textbox.customProperties ?? []), 'font']

  private _font: FontSource | null = null
  private _fontStatus: FontTextStatus = 'unloaded'
  private _autoWidth = true
  private _task: Promise<void> | null = null

  constructor(text: string, options: FontTextOptions = {} as FontTextOptions) {
    const { font, autoLoad = true, ...rest } = options

    super(String(text ?? ''), {
      // CJK 没有空格，必须按字断行，否则 Textbox 会把整段当成一个词把宽度撑开
      splitByGrapheme: true,
      ...rest,
    })

    this._autoWidth = rest.width === undefined
    if (this._autoWidth) {
      this.on('changed', () => {
        if (!this.isEditing) this.fitToContent()
      })
    }

    if (font) {
      this._font = normalizeFont(font)
      if (autoLoad) void this.loadFont().catch(() => undefined)
    }
  }

  /** 当前字体来源 */
  get font(): FontSource | null {
    return this._font
  }

  /** 同时切换 name（fontFamily）和 url，并重新加载 */
  set font(value: FontSource | null) {
    const next = value ? normalizeFont(value) : null
    if (next?.name === this._font?.name && next?.url === this._font?.url) return

    this._font = next
    this._fontStatus = 'unloaded'
    if (next) {
      void this.loadFont().catch(() => undefined)
    } else {
      this.set('fontFamily', '')
      this.initDimensions()
      this.dirty = true
      this.canvas?.requestRenderAll()
    }
  }

  get fontStatus(): FontTextStatus {
    return this._fontStatus
  }

  /** 等字体就绪；多次调用共享同一次加载 */
  loadFont(): Promise<void> {
    const font = this._font
    if (!font) return Promise.reject(new Error('[font] font 未设置'))
    if (this._fontStatus === 'loaded') return Promise.resolve()
    if (this._task) return this._task

    this._fontStatus = 'loading'
    this._task = (async () => {
      try {
        // 统一走加载层：浏览器 FontFace、node registerFont，细节在 #font-runtime
        await fontManager.get({ url: font.url, name: font.name })
        // 期间又换了字体就丢弃这次结果
        if (this._font !== font) return

        // 注册完再换 family：属性变化才能让 fabric 丢掉旧的测量缓存
        this.set('fontFamily', font.name)
        this._fontStatus = 'loaded'
        this.initDimensions()
        if (this._autoWidth) this.fitToContent()
        this.dirty = true
        this.canvas?.requestRenderAll()
        this.fire('font:loaded', font)
      } catch (error) {
        if (this._font === font) this._fontStatus = 'error'
        throw error
      } finally {
        this._task = null
      }
    })()

    return this._task
  }

  /** 自动宽度：按当前字体量出单行宽度，再写回 width */
  private fitToContent(): void {
    if (!this.text) return
    const previous = this.width
    this.width = 1e6
    this.initDimensions()
    let content = 0
    for (let i = 0; i < this.textLines.length; i++) {
      content = Math.max(content, this.getLineWidth(i))
    }
    // +1px 余量：避免量到的宽度和 Textbox 折行计算的浮点结果差一点点就多折一行
    this.width = Math.max(1, Math.ceil(content) + 1)
    this.initDimensions()
    this.dirty = true
    if (previous !== this.width) this.setCoords()
    this.canvas?.requestRenderAll()
  }
}

export type FontTextInstance = FontText

classRegistry.setClass(FontText)