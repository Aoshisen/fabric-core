/**
 * 可复用组件入口（浏览器 / node 共用）。
 *
 * FontText 直接 `extends FabricObject`，拿到哪份 fabric bundle 由模块解析决定：
 * package.json 的 `imports.#fabric` 在 node 下映射到 `fabric/node`，
 * 浏览器打包时走默认的 `fabric`。因此这里没有运行时注入，也不需要两套类定义。
 *
 * 两个 bundle 的 classRegistry 也是各自独立的，各自注册自己的 FontText，
 * 所以同一份源码在两端都能被 enlivenObjects 正确还原。
 */
export { FontText } from './FontText.ts'
export type { FontTextInstance, FontTextOptions, FontTextStatus, FontSource } from './FontText.ts'
// 加载层在全局的 src/font，这里只做转出，方便从 libs 一处引用
export { fontManager, Font, FontError, FontManager } from '../font/index.ts'
export type { FontErrorCode, FontRequest } from '../font/index.ts'
export type { FontFormat, FontStatus, FontURLDescriptor } from '../font/index.ts'

// 图像图层：能力按 mixin 拆分，ImageLayer 是组合好的即用版本
export { ImageLayer, loadImage, withImagePipeline, withFillMode, withPixelFilter, withOutline, withMask } from './image/index.ts'
export type {
  Constructor,
  FillMode,
  ImageElement,
  ImageLayerHost,
  ImageLayerOptions,
  MaskState,
  OutlineState,
  PixelFilterState,
  StrokeAlign,
} from './image/index.ts'