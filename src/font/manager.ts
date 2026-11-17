import { FontManager } from './FontManager.ts'

/**
 * 页面 / 进程级单例。
 *
 * 加载层是全局能力：任何地方拿到的都是同一份字体表，
 * 不需要由入口在运行时注入，也不会因为模块边界出现两份缓存。
 */
export const fontManager = new FontManager()