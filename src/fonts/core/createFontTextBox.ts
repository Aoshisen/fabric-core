import type { Textbox } from 'fabric'
import { deriveFontFamily } from './deriveFontFamily.ts'
import type { FontManager } from './FontManager.ts'
import type { FontFabricApi, FontRecord, FontStatus } from './types.ts'

export interface FontTextBoxOptions {
  /** 在线字体地址，字体族名由该 URL 推导，不需要（也不能）手填 fontFamily */
  fontURL: string
  /** 是否在构造时自动开始加载，默认 true。node 端通常设 false 以便先 await manager.load() */
  autoLoad?: boolean
  /** 其余原样透传给 fabric Textbox */
  [key: string]: unknown
}

export interface FontTextBoxInstance extends Textbox {
  fontURL: string
  readonly fontStatus: FontStatus | 'unloaded'
  loadFont(): Promise<FontRecord>
}

export interface CreateFontTextBoxOptions {
  /** 由入口注入：浏览器给 fabric，node 给 fabric/node，两者是不同的 bundle */
  fabric: FontFabricApi
  manager: FontManager
}

/**
 * 生成自定义 TextBox 类。
 *
 * 之所以用工厂而不是直接 `class X extends Textbox`：fabric 7 的浏览器包
 * （`fabric`）与服务端包（`fabric/node`）是两份独立 bundle，各自的
 * classRegistry 互不相通。两端必须各自用「自己那份」Textbox 作为基类并注册到
 * 「自己那份」registry，反序列化 enlivenObjects 才能正常工作。
 *
 * 与原生 Textbox 唯一的区别就是多了一个 fontURL：
 * - fontFamily 强制等于 URL 推导出来的名字
 * - 自动向 FontManager 申请字体，加载完成后重排文本并触发重绘
 * - fontURL 参与序列化 / 反序列化 / 撤销状态
 */
export function createFontTextBox({ fabric, manager }: CreateFontTextBoxOptions) {
  type TextboxCtor = new (
    text: string,
    options?: Record<string, unknown>,
  ) => Textbox

  const Base = fabric.Textbox as unknown as TextboxCtor & {
    stateProperties: string[]
  }

  class FontTextBox extends Base {
    static type = 'FontTextBox'
    /** 让 fabric 的 toObject() 自动带上 fontURL */
    static customProperties = ['fontURL']
    /** 让 fontURL 进入 stateProperties，便于撤销/重做恢复 */
    static stateProperties = [...Base.stateProperties, 'fontURL']

    private _fontURL = ''
    private _fontReady: Promise<FontRecord> | null = null
    private _autoLoad = true

    constructor(text: string, options: FontTextBoxOptions) {
      const { fontURL, autoLoad = true, ...rest } = options
      super(text, {
        ...rest,
        fontFamily: deriveFontFamily(fontURL),
      })
      this._autoLoad = autoLoad
      // 走 setter，统一处理「改 URL → 换 fontFamily → 重新加载」
      this.fontURL = fontURL
    }

    get fontURL(): string {
      return this._fontURL
    }

    set fontURL(url: string) {
      const next = String(url ?? '').trim()
      if (next === this._fontURL) return

      this._fontURL = next
      this._fontReady = null
      // 不等网络：先按推导名渲染（会 fallback 到系统字体），加载完成后校正
      this.set({ fontFamily: deriveFontFamily(next) })

      if (next && this._autoLoad) {
        void this.loadFont().catch(() => {
          // 错误已记录在 FontManager 里，避免未处理的 Promise rejection
        })
      }
    }

    get fontStatus(): FontStatus | 'unloaded' {
      return manager.get(this._fontURL)?.status ?? 'unloaded'
    }

    /** 显式等待字体就绪；多次调用共享同一个 Promise，失败后可重试 */
    loadFont(): Promise<FontRecord> {
      if (!this._fontURL) {
        return Promise.reject(new Error('[font] fontURL 为空'))
      }
      if (!this._fontReady) {
        this._fontReady = manager
          .load(this._fontURL)
          .then((record) => {
            if (this.fontFamily !== record.family) {
              this.set({ fontFamily: record.family })
            }
            this.initDimensions()
            this.setCoords()
            this.dirty = true
            this.canvas?.requestRenderAll()
            // 自定义事件名不在 fabric 的 ObjectEvents 联合类型里，这里放宽一次
            ;(this as unknown as {
              fire(name: string, options?: Record<string, unknown>): void
            }).fire('font:loaded', { url: record.url, family: record.family })
            return record
          })
          .catch((error: unknown) => {
            this._fontReady = null
            throw error
          })
      }
      return this._fontReady
    }
  }

  // setClass 不带 type 时会同时注册 'FontTextBox' 与小写别名
  fabric.classRegistry.setClass(FontTextBox)

  return FontTextBox as unknown as {
    new (text: string, options: FontTextBoxOptions): FontTextBoxInstance
    readonly type: string
    fromObject(object: Record<string, unknown>): Promise<FontTextBoxInstance>
  }
}
