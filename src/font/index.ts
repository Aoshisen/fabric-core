/**
 * 字体加载层入口：URL 解析 + 浏览器 FontFace 加载 + 进程级单例。
 * 与渲染层（src/fonts 里的 FontText）分开，本身不依赖 fabric。
 */
export { Font } from './Font.ts'
export { FontError } from './FontError.ts'
export type { FontErrorCode } from './FontError.ts'
export { FontManager } from './FontManager.ts'
export type { FontRequest } from './FontManager.ts'
export { fontManager } from './manager.ts'
export type { FontFormat, FontStatus, FontURLDescriptor } from './types.ts'