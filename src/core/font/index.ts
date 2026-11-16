/**
 * 字体加载层入口：全局共享的 Font / FontManager 与那个进程级单例。
 *
 * 与渲染层（src/fonts 里的 FontText）分开，是因为加载只依赖 fetch + opentype，
 * 跟 fabric 无关，任何页面 / 进程都可以直接用。
 */
export { Font } from './Font.ts'
export { FontError } from './FontError.ts'
export type { FontErrorCode } from './FontError.ts'
export { FontManager } from './FontManager.ts'
export type { FontRequest } from './FontManager.ts'
export { fontManager } from './manager.ts'
export type { FontFormat, FontLoadOptions, FontStatus, FontURLDescriptor } from './types.ts'