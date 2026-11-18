/**
 * 描边：外描边扩画布，内描边贴在内侧。
 * outlineWidth 统一按“屏幕显示像素”理解，内部换算成源图像素后交给轮廓算法。
 */
import { buildOutlinedCanvas, outlineMargin } from '../outline.ts'
import type {
  Constructor,
  ImageLayerBase,
  Mixin,
  OutlineCapability,
  OutlineState,
} from '../types.ts'

export function withOutline<TBase extends Constructor<ImageLayerBase>>(
  Base: TBase,
): Mixin<TBase, OutlineCapability> {
  class WithOutline extends Base {
    outlineWidth = 0
    outlineColor = '#ffffff'
    outlineAlign: OutlineState['outlineAlign'] = 'outer'

    _buildDisplay(base: HTMLCanvasElement): HTMLCanvasElement {
      const display = super._buildDisplay(base)
      if (this.outlineWidth <= 0 || !base.width) return display

      const scale = this.frameWidth / base.width
      if (!scale) return display

      let sourcePixelWidth = this.outlineWidth / scale
      if (this.outlineAlign === 'outer') {
        // 外描边会扩大画布，整体缩放比随之变小，按最终画布宽度反算两次即可收敛，
        // 保证描边的视觉宽度等于 outlineWidth（图片按描边宽度等比缩小）
        for (let i = 0; i < 2; i++) {
          const margin = outlineMargin(sourcePixelWidth, 'outer')
          sourcePixelWidth =
            (this.outlineWidth * (base.width + margin * 2)) / this.frameWidth
        }
      }

      return buildOutlinedCanvas(display, {
        sourcePixelWidth,
        // 颜色被清空（null）时回退白色，描边本身仍由 outlineWidth 控制
        color: this.outlineColor || '#ffffff',
        align: this.outlineAlign,
      })
    }

    _contentKey(): string {
      return `${super._contentKey()}|outline:${this.outlineWidth}:${this.outlineColor}:${this.outlineAlign}`
    }

    async setOutline(state: Partial<OutlineState>): Promise<void> {
      if (state.outlineWidth !== undefined) this.outlineWidth = state.outlineWidth
      if (state.outlineColor !== undefined) this.outlineColor = state.outlineColor
      if (state.outlineAlign !== undefined) this.outlineAlign = state.outlineAlign
      await this.refresh()
    }
  }

  return WithOutline as unknown as Mixin<TBase, OutlineCapability>
}