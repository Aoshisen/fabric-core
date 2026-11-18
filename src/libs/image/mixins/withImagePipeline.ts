/**
 * 管线基座：源图加载、渲染顺序、缩放、序列化友好的状态。
 *
 * 它自己不处理业务能力，只定义 4 个钩子：
 * _buildBase / _buildDisplay / _syncLayout / _syncMask，
 * 由 withFillMode、withPixelFilter、withOutline、withMask 分别覆写。
 */
import { FabricImage } from '#fabric'
import { copyToCanvas, createCanvas, loadImage } from '../imageio.ts'
import type {
  Constructor,
  ImageLayerHost,
  ImagePipelineCapability,
  Mixin,
} from '../types.ts'

interface RenderedEntry {
  base: HTMLCanvasElement
  display: HTMLCanvasElement
}

export function withImagePipeline<TBase extends Constructor<FabricImage>>(
  Base: TBase,
): Mixin<TBase, ImagePipelineCapability & ImageLayerHost> {
  class WithImagePipeline extends Base implements ImageLayerHost {
    frameWidth = 300
    frameHeight = 300
    sourceElement: HTMLImageElement | null = null
    /** 源图地址，用于序列化与重新加载 */
    declaredSrc: string | null = null

    _version = 0
    _sourceToken = 0
    _memoKey = ''
    _memo: RenderedEntry | null = null

    /** 影响像素结果的所有参数拼成的指纹，用于实例内缓存 */
    _contentKey(): string {
      return `${this._sourceToken}|${this.frameWidth}x${this.frameHeight}`
    }

    _buildBase(source: HTMLImageElement): HTMLCanvasElement {
      return copyToCanvas(source)
    }

    _buildDisplay(base: HTMLCanvasElement): HTMLCanvasElement {
      return base
    }

    _syncLayout(display: HTMLCanvasElement): void {
      // fabric 的 Image 用 width/height 做源矩形裁剪，不能把 width 压回 base 尺寸，
      // 否则会把 display 画布裁掉一块。display 就是最终绘制内容：
      // 外描边时它比 base 大，整体缩到框内后图片会等比缩小；
      // 内描边不扩画布，图片尺寸不变。
      this.setElement(display)
      const width = display.width || 1
      const height = display.height || 1
      this.set({
        scaleX: this.frameWidth / width,
        scaleY: this.frameHeight / height,
      })
      this.setCoords()
      this.set('dirty', true)
    }

    async _syncMask(_display: HTMLCanvasElement): Promise<void> {
      return
    }

    /** 换源图：传 null 清空 */
    async setSource(src: string | null): Promise<void> {
      this.declaredSrc = src
      this._sourceToken++
      this._memo = null
      this._memoKey = ''

      if (!src) {
        this.sourceElement = null
        this.set('dirty', true)
        this.canvas?.requestRenderAll()
        return
      }

      const token = this._sourceToken
      const image = await loadImage(src)
      // 连续换图时，慢的旧请求不能覆盖新图
      if (token !== this._sourceToken) return
      this.sourceElement = image
      await this.refresh()
    }

    /** 反序列化时图片已经加载好，直接作为源图 */
    async setSourceElement(element: HTMLImageElement): Promise<void> {
      this._sourceToken++
      this._memo = null
      this._memoKey = ''
      this.sourceElement = element
      await this.refresh()
    }

    /** 调整图层框尺寸 */
    async setFrame(width: number, height: number): Promise<void> {
      if (width > 0) this.frameWidth = width
      if (height > 0) this.frameHeight = height
      this._memo = null
      this._memoKey = ''
      await this.refresh()
    }

    /** 参数变化后重新走一遍管线 */
    async refresh(): Promise<void> {
      const source = this.sourceElement
      if (!source) return

      const version = ++this._version
      const key = this._contentKey()

      let entry = this._memo
      if (!entry || this._memoKey !== key) {
        const base = this._buildBase(source)
        const display = this._buildDisplay(base)
        if (version !== this._version) return
        entry = { base, display }
        this._memo = entry
        this._memoKey = key
      }

      this._syncLayout(entry.display)
      await this._syncMask(entry.display)
      if (version !== this._version) return

      this.set('dirty', true)
      this.canvas?.requestRenderAll()
    }

    /**
     * 释放缓存与源图引用。
     * 不 dispose clipPath 的元素：蒙版图按 URL 缓存在模块级，可能被多个图层共用。
     */
    override dispose(): void {
      this._memo = null
      this._memoKey = ''
      this.sourceElement = null
      this.clipPath = undefined
      super.dispose()
    }
  }

  return WithImagePipeline as unknown as Mixin<
    TBase,
    ImagePipelineCapability & ImageLayerHost
  >
}

/** 构造占位元素，避免 fabric 拿到空元素 */
export function createPlaceholderElement(): HTMLCanvasElement {
  return createCanvas(1, 1)
}