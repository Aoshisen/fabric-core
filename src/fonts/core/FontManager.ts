import { deriveFontFamily, getFontFormat, shortHash } from './deriveFontFamily.ts'
import type {
  FontDriver,
  FontManagerListener,
  FontRecord,
  FontRuntime,
} from './types.ts'

function normalizeUrl(url: string): string {
  const value = String(url ?? '').trim()
  if (!value) throw new Error('[font] fontURL 不能为空')
  return value
}

/**
 * 字体注册表：所有已加载（或正在加载 / 加载失败）的字体都集中在这里。
 *
 * 特性：
 * - 同一个 URL 只加载一次，并发调用共享同一个 Promise
 * - family 由 URL 推导；不同 URL 撞名时自动加稳定短哈希后缀
 * - 状态机 loading → loaded / error，失败后可重试
 * - 环境差异全部由注入的 FontDriver 承担，本类不感知浏览器或 node
 */
export class FontManager {
  private driver: FontDriver
  private readonly records = new Map<string, FontRecord>()
  private readonly pending = new Map<string, Promise<FontRecord>>()
  /** family → url，用于撞名检测 */
  private readonly familyOwner = new Map<string, string>()
  private readonly listeners = new Set<FontManagerListener>()

  constructor(driver: FontDriver) {
    this.driver = driver
  }

  get runtime(): FontRuntime {
    return this.driver.runtime
  }

  /** 运行时切换驱动（例如 SSR 场景），有进行中的任务时拒绝切换 */
  useDriver(driver: FontDriver): void {
    if (this.pending.size > 0) {
      throw new Error('[font] 有字体正在加载，不能切换驱动')
    }
    this.driver = driver
  }

  /**
   * 同步取得某个 URL 最终使用的 family。
   * 构造 TextBox 时就能先把 fontFamily 设好，不必等网络请求回来。
   */
  resolveFamily(url: string): string {
    const key = normalizeUrl(url)
    const existing = this.records.get(key)
    if (existing && existing.status !== 'error') return existing.family

    const base = deriveFontFamily(key)
    const occupiedBy = this.familyOwner.get(base)
    if (!occupiedBy || occupiedBy === key) return base

    let candidate = `${base}-${shortHash(key)}`
    let index = 1
    while (this.familyOwner.has(candidate) && this.familyOwner.get(candidate) !== key) {
      candidate = `${base}-${shortHash(key)}-${++index}`
    }
    return candidate
  }

  /** 加载（或复用已加载的）在线字体，返回对应的记录 */
  load(url: string): Promise<FontRecord> {
    const key = normalizeUrl(url)

    const ready = this.records.get(key)
    if (ready?.status === 'loaded') return Promise.resolve(ready)

    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight

    const family = this.resolveFamily(key)
    const record: FontRecord = {
      url: key,
      family,
      format: getFontFormat(key),
      runtime: this.runtime,
      status: 'loading',
    }

    this.records.set(key, record)
    this.familyOwner.set(family, key)
    this.emit()

    const task = (async () => {
      try {
        const result = await this.driver.load({
          url: key,
          family,
          format: record.format,
        })
        record.status = 'loaded'
        record.loadedAt = Date.now()
        record.detail = result.detail
        record.dispose = result.dispose
        delete record.error
        this.emit()
        return record
      } catch (error) {
        record.status = 'error'
        record.error = error instanceof Error ? error.message : String(error)
        if (this.familyOwner.get(family) === key) this.familyOwner.delete(family)
        this.emit()
        throw error instanceof Error ? error : new Error(String(error))
      } finally {
        this.pending.delete(key)
      }
    })()

    this.pending.set(key, task)
    return task
  }

  /** 批量预加载，常用于进页面前把字体准备好 */
  preload(urls: readonly string[]): Promise<FontRecord[]> {
    return Promise.all(urls.map((url) => this.load(url)))
  }

  get(url: string): FontRecord | undefined {
    return this.records.get(normalizeUrl(url))
  }

  getByFamily(family: string): FontRecord | undefined {
    const url = this.familyOwner.get(family)
    return url ? this.records.get(url) : undefined
  }

  has(url: string): boolean {
    return this.records.has(normalizeUrl(url))
  }

  isReady(url: string): boolean {
    return this.records.get(normalizeUrl(url))?.status === 'loaded'
  }

  /** 返回快照，外部修改不会影响内部状态 */
  list(): FontRecord[] {
    return Array.from(this.records.values(), (record) => ({ ...record }))
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

  /** 移除单个字体。node 端注册是进程级的，只能清理文件缓存，无法真正注销 */
  async unload(url: string): Promise<boolean> {
    const key = normalizeUrl(url)
    if (this.pending.has(key)) {
      throw new Error('[font] 字体仍在加载中，不能卸载')
    }
    const record = this.records.get(key)
    if (!record) return false

    if (record.dispose) await record.dispose()
    if (this.familyOwner.get(record.family) === key) {
      this.familyOwner.delete(record.family)
    }
    this.records.delete(key)
    this.emit()
    return true
  }

  async clear(): Promise<void> {
    for (const record of this.records.values()) {
      if (record.dispose) await record.dispose()
    }
    this.records.clear()
    this.familyOwner.clear()
    this.pending.clear()
    this.emit()
  }

  private emit(): void {
    const snapshot = this.list()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
