import { Font } from './Font.ts'
import type {
  FontFormat,
  FontManagerListener,
  FontManagerOptions,
  FontRecord,
  FontURLDescriptor,
} from './types.ts'

function normalizeUrl(url: string): string {
  const value = String(url ?? '').trim()
  if (!value) throw new Error('[font] fontURL 不能为空')
  return value
}

/**
 * 全局字体管理器。
 *
 * 因为字体已经不是「宿主字体系统里的注册项」，而是内存里的字形表，
 * 所以这里只剩注册表本身：按 URL 去重、并发合并、生命周期、订阅通知。
 *
 * 没有浏览器 / node 分支，没有家族撞名处理（family 只是元数据，不参与注册），
 * 也没有「注册时序」这类约束 —— 解析完就能排版。
 */
export class FontManager {
  /** url → 字体实体 */
  private readonly registry = new Map<string, Font>()
  private readonly pending = new Map<string, Promise<FontRecord>>()
  private readonly listeners = new Set<FontManagerListener>()

  constructor(_options: FontManagerOptions = {}) {
    // 目前没有可配置项；保留参数位以便后续加并发上限 / 缓存策略
  }

  /**
   * 静态纯解析：委托 `Font.parse()`，一条正则取出字体名 + 格式并生成 CSS。
   * 不依赖注册表状态，同一个 URL 在任何环境、任何时候结果都一致。
   */
  static parseURL(url: string): FontURLDescriptor {
    return Font.parse(url)
  }

  /**
   * 实例解析：产出与实际使用完全一致的 family / css。
   * 不再做撞名去重（字形表不占宿主的 family 命名空间）。
   */
  parseFontURL(url: string): FontURLDescriptor {
    return Font.parse(url)
  }

  /** 把注册表里的字体输出成一份 `@font-face` 样式表，供降级到原生文字时使用 */
  toCSS(options: { onlyLoaded?: boolean } = {}): string {
    const fonts = Array.from(this.registry.values())
    const picked = options.onlyLoaded === false ? fonts : fonts.filter((font) => font.isReady)
    return picked
      .map((font) => font.toCSS())
      .filter(Boolean)
      .join('\n\n')
  }

  /** 已注册的字体实体（实时引用，可用于读取 name / css / status / otFont） */
  get fonts(): Font[] {
    return Array.from(this.registry.values())
  }

  /** 兼容旧调用：family 现在就是 URL 解析出来的名字，不做去重 */
  resolveFamily(url: string): string {
    return this.registry.get(normalizeUrl(url))?.family ?? Font.parse(url).family
  }

  /** 加载（或复用已加载的）在线字体，返回对应的记录 */
  load(url: string): Promise<FontRecord> {
    const key = normalizeUrl(url)

    const existing = this.registry.get(key)
    if (existing?.isReady) return Promise.resolve(existing.toRecord())

    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight

    const font = existing ?? this.createFont(key)
    this.emit()

    const task = font
      .load()
      .then((record) => {
        this.emit()
        return record
      })
      .catch((error: unknown) => {
        this.emit()
        throw error
      })
      .finally(() => {
        this.pending.delete(key)
      })

    this.pending.set(key, task)
    return task
  }

  /** 批量预加载，常用于进页面前把字体准备好 */
  preload(urls: readonly string[]): Promise<FontRecord[]> {
    return Promise.all(urls.map((url) => this.load(url)))
  }

  /** 取得记录（内部对象，加载过程中会原地更新） */
  get(url: string): FontRecord | undefined {
    return this.registry.get(normalizeUrl(url))?.toRecord()
  }

  /** 取得字体实体本身 */
  getFont(url: string): Font | undefined {
    return this.registry.get(normalizeUrl(url))
  }

  getByFamily(family: string): FontRecord | undefined {
    const font = this.fonts.find((item) => item.family === family)
    return font?.toRecord()
  }

  has(url: string): boolean {
    return this.registry.has(normalizeUrl(url))
  }

  isReady(url: string): boolean {
    return this.registry.get(normalizeUrl(url))?.isReady ?? false
  }

  /** 返回快照，外部修改不会影响内部状态 */
  list(): FontRecord[] {
    return this.fonts.map((font) => ({ ...font.toRecord() }))
  }

  get loaded(): FontRecord[] {
    return this.list().filter((record) => record.status === 'loaded')
  }

  /** 订阅注册表变化，返回取消订阅函数 */
  subscribe(listener: FontManagerListener, immediate = true): () => void {
    this.listeners.add(listener)
    if (immediate) listener(this.list())
    return () => this.listeners.delete(listener)
  }

  /** 移除单个字体。字形表被释放，下次使用会重新下载解析 */
  unload(url: string): boolean {
    const key = normalizeUrl(url)
    if (this.pending.has(key)) {
      throw new Error('[font] 字体仍在加载中，不能卸载')
    }
    const font = this.registry.get(key)
    if (!font) return false

    font.dispose()
    this.registry.delete(key)
    this.emit()
    return true
  }

  clear(): void {
    for (const font of this.registry.values()) font.dispose()
    this.registry.clear()
    this.pending.clear()
    this.emit()
  }

  /** 创建并登记一个字体实体 */
  private createFont(key: string): Font {
    const font = new Font(Font.parse(key))
    this.registry.set(key, font)
    return font
  }

  private emit(): void {
    const snapshot = this.list()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}

/** 兼容旧调用：实际逻辑已内聚到 Font.parse() */
export function deriveFontFamily(url: string): string {
  return Font.parse(url).family
}

export function getFontFileName(url: string): string {
  return Font.parse(url).fileName
}

export function getFontFormat(url: string): FontFormat {
  return Font.parse(url).format
}
