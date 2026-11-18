/**
 * 填充方式：contain（完整显示）/ fill（铺满裁切）。
 * 构图在 `_buildBase` 里完成，输出画布宽高比等于图层框，因此不需要额外 clipPath。
 */
import { composeBase } from '../pixels.ts'
import type {
  Constructor,
  FillMode,
  FillModeCapability,
  ImageLayerBase,
  Mixin,
} from '../types.ts'

export function withFillMode<TBase extends Constructor<ImageLayerBase>>(
  Base: TBase,
): Mixin<TBase, FillModeCapability> {
  class WithFillMode extends Base {
    fillMode: FillMode = 'contain'

    _buildBase(source: HTMLImageElement): HTMLCanvasElement {
      return composeBase(source, this.frameWidth, this.frameHeight, this.fillMode)
    }

    _contentKey(): string {
      return `${super._contentKey()}|fill:${this.fillMode}`
    }

    async setFillMode(mode: FillMode): Promise<void> {
      if (mode === this.fillMode) return
      this.fillMode = mode
      await this.refresh()
    }
  }

  return WithFillMode as unknown as Mixin<TBase, FillModeCapability>
}