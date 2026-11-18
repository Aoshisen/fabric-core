import {
  Circle,
  Ellipse,
  IText,
  Path,
  Polygon,
  Polyline,
  Rect,
  Triangle,
  type Canvas,
  type FabricObject,
} from 'fabric'
import { toValue, type MaybeRefOrGetter } from 'vue'
import type { ShapeKind, SidebarItem } from '../config/sidebar.ts'
import { FontText, ImageLayer, loadImage } from '../libs/index.ts'

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/** 只关心成功 / 失败提示，避免依赖 naive-ui 的完整 MessageApi 类型 */
export interface MessageLike {
  success: (content: string) => void
  error: (content: string) => void
  warning: (content: string) => void
  info: (content: string) => void
}

export interface UseEditorActionsOptions {
  canvas: MaybeRefOrGetter<Canvas | null>
  message: MessageLike
  /** 增删对象后同步计数 / 选中状态 */
  onChanged: () => void
}

const FONT = {
  name: 'Noto Sans SC',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-chinese-simplified-400-normal.woff',
}

const ACCENTS = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6']
let colorIndex = 0
function nextColor() {
  return ACCENTS[colorIndex++ % ACCENTS.length]
}

/** 编辑器里的所有「命令」：创建 / 删除 / 层级，全部由 canvas 驱动 */
export function useEditorActions(options: UseEditorActionsOptions) {
  const { message, onChanged } = options

  function canvasOf(): Canvas | null {
    return toValue(options.canvas)
  }

  /** 在画布可视区域内随机摆放（按包围盒算，兼容 origin / 旋转） */
  function placeRandom(object: FabricObject) {
    const canvas = canvasOf()
    if (!canvas) return

    object.setCoords()
    const rect = object.getBoundingRect()
    const margin = 48
    const spanX = Math.max(1, canvas.getWidth() - rect.width - margin * 2)
    const spanY = Math.max(1, canvas.getHeight() - rect.height - margin * 2)
    const x = margin + Math.random() * spanX
    const y = margin + Math.random() * spanY

    object.set({ left: object.left + (x - rect.left), top: object.top + (y - rect.top) })
    object.setCoords()
  }

  function createShape(kind: ShapeKind): FabricObject {
    // 位置交给 placeRandom，这里只描述形状本身
    switch (kind) {
      case 'rect':
        return new Rect({ width: 180, height: 120, rx: 14, ry: 14, fill: nextColor() })
      case 'circle':
        return new Circle({ radius: 60, fill: nextColor() })
      case 'ellipse':
        return new Ellipse({ rx: 80, ry: 55, fill: nextColor() })
      case 'triangle':
        return new Triangle({ width: 180, height: 140, fill: nextColor() })
      case 'polyline':
        return new Polyline(
          [
            { x: 0, y: 0 },
            { x: 60, y: -40 },
            { x: 120, y: 20 },
            { x: 180, y: -20 },
          ],
          { fill: '', stroke: nextColor(), strokeWidth: 4 },
        )
      case 'polygon':
        return new Polygon(
          [
            { x: 0, y: 0 },
            { x: 80, y: 0 },
            { x: 100, y: 70 },
            { x: 40, y: 110 },
            { x: -20, y: 70 },
          ],
          { fill: nextColor() },
        )
      case 'path':
        return new Path('M 0 0 L 160 0 L 120 120 L 40 120 Z', { fill: nextColor() })
    }
  }

  function addObject(object: FabricObject, label: string) {
    const canvas = canvasOf()
    if (!canvas) return

    canvas.add(object)
    placeRandom(object)
    canvas.setActiveObject(object)
    canvas.requestRenderAll()
    onChanged()
    message.success(`已添加${label}`)
  }

  function addShape(kind: ShapeKind, label: string) {
    addObject(createShape(kind), label)
  }

  function addText() {
    const text = new IText('双击编辑文本', {
      fontFamily: 'PingFang SC, sans-serif',
      fontSize: 28,
      fill: '#1b2027',
    })
    addObject(text, '文本')
  }

  function addFontText() {
    const canvas = canvasOf()
    if (!canvas) return

    const text = new FontText('在线字体 FontText', {
      font: { ...FONT },
      fontSize: 32,
      fill: '#1b2027',
    })
    addObject(text, 'FontText')

    void text
      .loadFont()
      .then(() => {
        canvas.requestRenderAll()
        message.success('FontText 已就绪')
      })
      .catch((error: unknown) => {
        message.error(`字体加载失败：${error instanceof Error ? error.message : String(error)}`)
      })
  }

  async function addImage(file: File) {
    const canvas = canvasOf()
    if (!canvas) return

    try {
      // 用 data URL 而不是 blob URL：ImageLayer 需要保留 src 以便重新加载与序列化
      const src = await readFileAsDataURL(file)
      const element = await loadImage(src)
      const scale = Math.min(1, 240 / Math.max(element.naturalWidth, element.naturalHeight))
      const layer = new ImageLayer(element, {
        src,
        frameWidth: element.naturalWidth * scale,
        frameHeight: element.naturalHeight * scale,
        originX: 'center',
        originY: 'center',
      })
      addObject(layer, '图片图层')
    } catch (error) {
      message.error(`图片加载失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function removeSelected() {
    const canvas = canvasOf()
    if (!canvas) return

    const active = canvas.getActiveObjects()
    if (!active.length) {
      message.warning('没有选中任何对象')
      return
    }

    canvas.discardActiveObject()
    active.forEach((object) => canvas.remove(object))
    canvas.requestRenderAll()
    onChanged()
    message.success(`已删除 ${active.length} 个对象`)
  }

  function clearAll() {
    const canvas = canvasOf()
    if (!canvas) return

    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    onChanged()
    message.info('画布已清空')
  }

  function bringToFront() {
    const canvas = canvasOf()
    if (!canvas) return
    canvas.getActiveObjects().forEach((object) => canvas.bringObjectToFront(object))
    canvas.requestRenderAll()
  }

  function sendToBack() {
    const canvas = canvasOf()
    if (!canvas) return
    canvas.getActiveObjects().forEach((object) => canvas.sendObjectToBack(object))
    canvas.requestRenderAll()
  }

  /** 左侧栏按钮统一入口：按 config/sidebar.ts 的 action 分发 */
  function onAction(item: SidebarItem) {
    switch (item.action) {
      case 'add-shape': {
        const payload = item.payload as { kind: ShapeKind; label: string }
        addShape(payload.kind, payload.label)
        break
      }
      case 'add-text':
        addText()
        break
      case 'add-font-text':
        addFontText()
        break
      case 'front':
        bringToFront()
        break
      case 'back':
        sendToBack()
        break
      case 'remove':
        removeSelected()
        break
      case 'clear':
        clearAll()
        break
      // pick-image 由 n-upload 直接回调 onAddImage
      case 'pick-image':
        break
    }
  }

  return {
    onAction,
    addShape,
    addText,
    addFontText,
    addImage,
    removeSelected,
    clearAll,
    bringToFront,
    sendToBack,
  }
}