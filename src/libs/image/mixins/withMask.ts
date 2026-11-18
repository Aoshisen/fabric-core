/**
 * 蒙版遮罩：把蒙版图作为 clipPath 挂在图片上，按 cover 铺满图层框。
 *
 * fabric 7 的 clipPath 在对象自身像素坐标系里绘制，
 * 所以只需要 left/top = 0，scale 按 base 与蒙版图的尺寸比计算。
 */
import { FabricImage } from '#fabric'
import { loadImage } from '../imageio.ts'
import type {
  Constructor,
  ImageLayerBase,
  MaskCapability,
  Mixin,
} from '../types.ts'

const maskCache = new Map<string, Promise<HTMLImageElement>>()

function loadMaskImage(src: string): Promise<HTMLImageElement> {
  const cached = maskCache.get(src)
  if (cached) return cached

  const pending = loadImage(src).catch((error) => {
    // 失败结果不留在缓存里，方便重试
    if (maskCache.get(src) === pending) maskCache.delete(src)
    throw error
  })
  maskCache.set(src, pending)
  return pending
}

export function withMask<TBase extends Constructor<ImageLayerBase>>(
  Base: TBase,
): Mixin<TBase, MaskCapability> {
  class WithMask extends Base {
    maskSrc: string | null = null

    async _syncMask(display: HTMLCanvasElement): Promise<void> {
      await super._syncMask(display)

      const src = this.maskSrc
      if (!src) {
        if (this.clipPath) {
          this.clipPath = undefined
          this.set('dirty', true)
        }
        return
      }

      const mask = await loadMaskImage(src)
      // 只按当前地址判断：同一地址共用同一个缓存 Promise，回调按发起顺序执行，
      // 后发起的 refresh 一定后写 clipPath；不同地址则由这里拦掉旧结果。
      if (src !== this.maskSrc) return

      const scale = Math.max(display.width / mask.width, display.height / mask.height) || 1
      this.clipPath = new FabricImage(mask, {
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        scaleX: scale,
        scaleY: scale,
        excludeFromExport: true,
      })
      this.set('dirty', true)
    }

    _contentKey(): string {
      return `${super._contentKey()}|mask:${this.maskSrc ?? ''}`
    }

    async setMask(maskSrc: string | null): Promise<void> {
      if (maskSrc === this.maskSrc) return
      this.maskSrc = maskSrc
      await this.refresh()
    }
  }

  return WithMask as unknown as Mixin<TBase, MaskCapability>
}