/**
 * ImageLayer 的类型与能力契约。
 *
 * 每个能力 mixin 都只依赖 `ImageLayerHost` 上的钩子：
 * - `_buildBase`   源图 → 基准画布（构图、滤镜）
 * - `_buildDisplay` 基准画布 → 显示画布（描边）
 * - `_syncLayout`  设定 width/height/scale
 * - `_syncMask`    同步 clipPath
 *
 * 因此能力可以单独挂到任意 `FabricImage` 子类上，不必使用 ImageLayer。
 */

export type FillMode = 'contain' | 'fill'

/** 描边相对形状的位置：外描边扩画布，内描边贴在形状内侧 */
export type StrokeAlign = 'outer' | 'inner'

export interface PixelFilterState {
  /** 是否去白底 */
  removeWhite: boolean
  /** 白色阈值 0-255，越高中性白越多 */
  whiteThreshold: number
  /** 单色滤镜颜色；null 表示关闭，可独立于去白底 */
  tintColor: string | null
}

export interface OutlineState {
  /** 描边宽度（屏幕显示像素），0 表示关闭 */
  outlineWidth: number
  outlineColor: string
  outlineAlign: StrokeAlign
}

export interface MaskState {
  /** 蒙版图地址；null 表示无蒙版 */
  maskSrc: string | null
}

export interface ImageLayerOptions {
  /** 图片地址；也可以在构造后调用 setSource */
  src?: string
  /** 图层框宽（未缩放前的逻辑尺寸） */
  frameWidth?: number
  /** 图层框高 */
  frameHeight?: number
  fillMode?: FillMode
  removeWhite?: boolean
  whiteThreshold?: number
  tintColor?: string | null
  outlineWidth?: number
  outlineColor?: string | null
  outlineAlign?: StrokeAlign
  maskSrc?: string | null
  /** 其余选项原样透传给 fabric Image */
  [key: string]: unknown
}

import type { FabricImage } from '#fabric'

export type Constructor<T = object> = new (...args: any[]) => T

/** 能力 mixin 的宿主：既能拿到 fabric Image 的成员，也满足管线钩子 */
export type ImageLayerBase = FabricImage & ImageLayerHost

/** 组合 mixin 的返回类型：保留原有实例类型并叠加新能力 */
export type Mixin<TBase extends Constructor, TAdd> = Constructor<InstanceType<TBase> & TAdd>

export interface ImagePipelineCapability {
  frameWidth: number
  frameHeight: number
  declaredSrc: string | null
  sourceElement: HTMLImageElement | null
  setSource(src: string | null): Promise<void>
  setSourceElement(element: HTMLImageElement): Promise<void>
  setFrame(width: number, height: number): Promise<void>
  refresh(): Promise<void>
  dispose(): void
}

export interface FillModeCapability {
  fillMode: FillMode
  setFillMode(mode: FillMode): Promise<void>
}

export interface PixelFilterCapability extends PixelFilterState {
  setPixelFilter(state: Partial<PixelFilterState>): Promise<void>
}

export interface OutlineCapability extends OutlineState {
  setOutline(state: Partial<OutlineState>): Promise<void>
}

export interface MaskCapability {
  maskSrc: string | null
  setMask(maskSrc: string | null): Promise<void>
}

/** 能力 mixin 依赖的宿主契约 */
export interface ImageLayerHost {
  frameWidth: number
  frameHeight: number
  sourceElement: HTMLImageElement | null
  refresh(): Promise<void>
  /** 源图 → 基准画布：构图 + 像素滤镜 */
  _buildBase(source: HTMLImageElement): HTMLCanvasElement
  /** 基准画布 → 显示画布：描边 */
  _buildDisplay(base: HTMLCanvasElement): HTMLCanvasElement
  /** 依据显示画布尺寸设定目标图层尺寸与缩放 */
  _syncLayout(display: HTMLCanvasElement): void
  /** 同步蒙版 clipPath（入参是最终绘制的显示画布） */
  _syncMask(display: HTMLCanvasElement): Promise<void>
  /** 影响渲染结果的参数指纹，用于实例内缓存 */
  _contentKey(): string
}