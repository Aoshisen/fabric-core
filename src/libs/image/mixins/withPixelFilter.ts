/**
 * 像素滤镜：去白底（fabric RemoveColor）+ 单色（fabric BlendColor tint）。
 * 单色不依赖去白底，可以单独开启。
 */
import { applyPixelFilters, normalizeTintColor } from '../pixels.ts'
import type {
  Constructor,
  ImageLayerBase,
  Mixin,
  PixelFilterCapability,
  PixelFilterState,
} from '../types.ts'

export function withPixelFilter<TBase extends Constructor<ImageLayerBase>>(
  Base: TBase,
): Mixin<TBase, PixelFilterCapability> {
  class WithPixelFilter extends Base {
    removeWhite = false
    whiteThreshold = 180

    private _tintColor: string | null = null

    /** 赋值即归一化：null / '' / transparent / alpha=0 都会关闭滤镜 */
    get tintColor(): string | null {
      return this._tintColor
    }

    set tintColor(value: string | null | undefined) {
      this._tintColor = normalizeTintColor(value)
    }

    _buildBase(source: HTMLImageElement): HTMLCanvasElement {
      const base = super._buildBase(source)
      return applyPixelFilters(base, {
        removeWhite: this.removeWhite,
        whiteThreshold: this.whiteThreshold,
        tintColor: this.tintColor,
      })
    }

    _contentKey(): string {
      return `${super._contentKey()}|px:${this.removeWhite}:${this.whiteThreshold}:${this.tintColor ?? ''}`
    }

    async setPixelFilter(state: Partial<PixelFilterState>): Promise<void> {
      if (state.removeWhite !== undefined) this.removeWhite = state.removeWhite
      if (state.whiteThreshold !== undefined) this.whiteThreshold = state.whiteThreshold
      if (state.tintColor !== undefined) this.tintColor = state.tintColor
      await this.refresh()
    }
  }

  return WithPixelFilter as unknown as Mixin<TBase, PixelFilterCapability>
}