/**
 * ImageLayer：把各个能力 mixin 组合成一个即用图层。
 *
 * 用法：
 * ```ts
 * const layer = new ImageLayer({
 *   src: 'https://cdn.example.com/a.png',
 *   frameWidth: 300,
 *   frameHeight: 300,
 *   fillMode: 'contain',
 *   removeWhite: true,
 *   tintColor: '#111111',
 *   outlineWidth: 2,
 *   outlineAlign: 'outer',
 *   maskSrc: 'https://cdn.example.com/mask.png',
 * })
 * ```
 */
import { classRegistry, FabricImage } from '#fabric'
import { withFillMode } from './mixins/withFillMode.ts'
import { createPlaceholderElement, withImagePipeline } from './mixins/withImagePipeline.ts'
import { withMask } from './mixins/withMask.ts'
import { withOutline } from './mixins/withOutline.ts'
import { withPixelFilter } from './mixins/withPixelFilter.ts'
import type { ImageLayerOptions } from './types.ts'

const Composed = withMask(
  withOutline(withPixelFilter(withFillMode(withImagePipeline(FabricImage)))),
)

export type ImageElement = HTMLImageElement | HTMLCanvasElement

function reportError(error: unknown): void {
  console.warn('[ImageLayer]', error)
}

function isImageElement(value: unknown): value is ImageElement {
  if (!value || typeof value !== 'object') return false
  if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) return true
  if (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) return true
  // node 端没有全局 HTMLImageElement：fabric/node 的 shim 与 node-canvas 的类名固定
  const name = Object.getPrototypeOf(value)?.constructor?.name
  return (
    name === 'HTMLImageElement' ||
    name === 'HTMLCanvasElement' ||
    name === 'Image' ||
    name === 'Canvas'
  )
}

/** 会进序列化的字段（组合类统一维护，避免各 mixin 静态侧互相覆盖） */
const SERIALIZED_PROPS = [
  'src',
  'frameWidth',
  'frameHeight',
  'fillMode',
  'removeWhite',
  'whiteThreshold',
  'tintColor',
  'outlineWidth',
  'outlineColor',
  'outlineAlign',
  'maskSrc',
]

export class ImageLayer extends Composed {
  static type = 'ImageLayer'

  static customProperties = [...FabricImage.customProperties, ...SERIALIZED_PROPS]

  constructor(options?: ImageLayerOptions)
  constructor(element: ImageElement | string, options?: ImageLayerOptions)
  constructor(
    elementOrOptions: ImageElement | string | ImageLayerOptions = {},
    maybeOptions: ImageLayerOptions = {},
  ) {
    const isOptions =
      typeof elementOrOptions === 'object' && !isImageElement(elementOrOptions)
    const options = (isOptions ? elementOrOptions : maybeOptions) as ImageLayerOptions
    const element = isOptions ? undefined : (elementOrOptions as ImageElement | string)

    const {
      src,
      frameWidth,
      frameHeight,
      fillMode,
      removeWhite,
      whiteThreshold,
      tintColor,
      outlineWidth,
      outlineColor,
      outlineAlign,
      maskSrc,
      ...rest
    } = options

    super((element ?? createPlaceholderElement()) as never, rest as never)

    if (frameWidth !== undefined) this.frameWidth = frameWidth
    if (frameHeight !== undefined) this.frameHeight = frameHeight
    if (fillMode !== undefined) this.fillMode = fillMode
    if (removeWhite !== undefined) this.removeWhite = removeWhite
    if (whiteThreshold !== undefined) this.whiteThreshold = whiteThreshold
    if (tintColor !== undefined) this.tintColor = tintColor
    if (outlineWidth !== undefined) this.outlineWidth = outlineWidth
    if (outlineColor) this.outlineColor = outlineColor
    if (outlineAlign !== undefined) this.outlineAlign = outlineAlign
    if (maskSrc !== undefined) this.maskSrc = maskSrc

    const source = src ?? (typeof element === 'string' ? element : null)
    if (element && isImageElement(element)) {
      // 反序列化路径：fabric 已经按 src 加载好图片
      this.declaredSrc = source
      void this.setSourceElement(element as HTMLImageElement).catch(reportError)
    } else if (source) {
      void this.setSource(source).catch(reportError)
    }
  }

  /** 避免 fabric Image 把显示画布编码成 base64 写进 JSON */
  override getSrc(): string {
    return this.declaredSrc ?? ''
  }
}

classRegistry.setClass(ImageLayer)