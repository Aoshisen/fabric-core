import { Font } from './Font.ts'

/** get() 的参数：字体地址 + 名字（名字同时是缓存 key 和 CSS family） */
export interface FontRequest {
  url: string
  name: string
}

function normalizeName(name: string): string {
  const value = String(name ?? '').trim()
  if (!value) throw new Error('[font] name 不能为空')
  return value
}

/**
 * 全局字体注册表。
 *
 * 对外只有一件事：给出 { url, name }，拿回加载好的 Font。
 * - 同 name 复用同一个字体实体
 * - 同 URL 复用同一次加载（并发合并在 Font.load() 里）
 * - 失败时 get() 直接 reject 成 FontError，实体留在表里，再调一次 get() 就是重试
 */
export class FontManager {
  private readonly fonts = new Map<string, Font>()

  /** 取字体：没加载过就按 { url, name } 建一个并加载 */
  async get({ url, name }: FontRequest): Promise<Font> {
    const key = normalizeName(name)
    const font = this.fonts.get(key) ?? this.create(key, url)
    await font.load()
    return font
  }

  /** 已登记的实体，不触发加载 */
  peek(name: string): Font | undefined {
    return this.fonts.get(normalizeName(name))
  }

  has(name: string): boolean {
    return this.fonts.has(normalizeName(name))
  }

  /** 释放字形表并移除登记，下次 get() 会重新加载 */
  delete(name: string): boolean {
    const key = normalizeName(name)
    const font = this.fonts.get(key)
    if (!font) return false
    font.dispose()
    return this.fonts.delete(key)
  }

  clear(): void {
    for (const font of this.fonts.values()) font.dispose()
    this.fonts.clear()
  }

  get size(): number {
    return this.fonts.size
  }

  private create(name: string, url: string): Font {
    const value = String(url ?? '').trim()
    if (!value) throw new Error('[font] url 不能为空')
    const font = new Font(Font.parse(value, name))
    this.fonts.set(name, font)
    return font
  }
}
