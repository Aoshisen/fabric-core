<script setup lang="ts">
import {
  Canvas,
  Circle,
  FabricImage,
  Ellipse,
  IText,
  Path,
  Polygon,
  Polyline,
  Rect,
  Triangle,
  type FabricObject,
} from 'fabric'
import {
  NButton,
  NFlex,
  NGi,
  NGrid,
  NLayout,
  NLayoutContent,
  NLayoutFooter,
  NLayoutSider,
  useMessage,
} from 'naive-ui'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { FontText } from '../libs/index.ts'

const workspaceRef = ref<HTMLDivElement | null>(null)
const canvasElRef = ref<HTMLCanvasElement | null>(null)
const canvas = shallowRef<Canvas | null>(null)
const message = useMessage()

const objectCount = ref(0)
const selectedCount = ref(0)

let resizeObserver: ResizeObserver | null = null
let cascade = 0

/** 自定义 FontText 用的在线字体 */
const FONT = {
  name: 'Noto Sans SC',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-chinese-simplified-400-normal.woff',
}

const accents = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6']
function nextColor() {
  return accents[cascade++ % accents.length]
}

type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polyline' | 'polygon' | 'path'

const shapes: Array<{ kind: ShapeKind; label: string }> = [
  { kind: 'rect', label: '矩形' },
  { kind: 'circle', label: '圆形' },
  { kind: 'ellipse', label: '椭圆' },
  { kind: 'triangle', label: '三角形' },
  { kind: 'polyline', label: '折线' },
  { kind: 'polygon', label: '多边形' },
  { kind: 'path', label: '路径' },
]

const hasSelection = () => selectedCount.value > 0

function syncCounts() {
  const c = canvas.value
  if (!c) return
  objectCount.value = c.getObjects().length
  selectedCount.value = c.getActiveObjects().length
}

function resize() {
  const el = workspaceRef.value
  const c = canvas.value
  if (!el || !c) return
  const { width, height } = el.getBoundingClientRect()
  if (!width || !height) return
  c.setDimensions({ width: Math.floor(width), height: Math.floor(height) })
  c.requestRenderAll()
}

function center() {
  const c = canvas.value
  return c ? { x: c.getWidth() / 2, y: c.getHeight() / 2 } : { x: 0, y: 0 }
}

function createShape(kind: ShapeKind): FabricObject {
  const { x, y } = center()
  const jitter = (cascade % 5) * 12
  const left = x - 90 + jitter
  const top = y - 60 + jitter

  switch (kind) {
    case 'rect':
      return new Rect({ left, top, width: 180, height: 120, rx: 14, ry: 14, fill: nextColor() })
    case 'circle':
      return new Circle({ left: left + 30, top, radius: 60, fill: nextColor() })
    case 'ellipse':
      return new Ellipse({ left: left + 30, top, rx: 80, ry: 55, fill: nextColor() })
    case 'triangle':
      return new Triangle({ left, top, width: 180, height: 140, fill: nextColor() })

    case 'polyline':
      return new Polyline(
        [
          { x: 0, y: 0 },
          { x: 60, y: -40 },
          { x: 120, y: 20 },
          { x: 180, y: -20 },
        ],
        { left, top: top + 60, fill: '', stroke: nextColor(), strokeWidth: 4 },
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
        { left: left + 40, top, fill: nextColor() },
      )
    case 'path':
      return new Path('M 0 0 L 160 0 L 120 120 L 40 120 Z', { left, top, fill: nextColor() })
  }
}

function addShape(kind: ShapeKind, label: string) {
  const c = canvas.value
  if (!c) return
  const obj = createShape(kind)
  c.add(obj)
  c.setActiveObject(obj)
  c.requestRenderAll()
  syncCounts()
  message.success(`已添加${label}`)
}

/** 隐藏的 file input，按钮只负责触发它 */
const fileInputRef = ref<HTMLInputElement | null>(null)

function pickImage() {
  fileInputRef.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void addImage(file)
}

async function addImage(file: File) {
  const c = canvas.value
  if (!c) return

  const url = URL.createObjectURL(file)
  try {
    const image = await FabricImage.fromURL(url)
    const { x, y } = center()
    const scale = Math.min(1, 240 / Math.max(image.width, image.height))
    image.set({ left: x, top: y, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
    c.add(image)
    c.setActiveObject(image)
    c.requestRenderAll()
    syncCounts()
    message.success('已添加图片')
  } catch (error) {
    message.error(`图片加载失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function addText() {
  const c = canvas.value
  if (!c) return
  const { x, y } = center()
  const text = new IText('双击编辑文本', {
    left: x - 70,
    top: y - 16,
    fontFamily: 'PingFang SC, sans-serif',
    fontSize: 28,
    fill: '#1b2027',
  })
  c.add(text)
  c.setActiveObject(text)
  c.requestRenderAll()
  syncCounts()
  message.success('已添加文本，双击可编辑')
}

function addFontText() {
  const c = canvas.value
  if (!c) return
  const { x, y } = center()
  const text = new FontText('在线字体 FontText', {
    font: { ...FONT },
    left: x - 120,
    top: y - 20,
    fontSize: 32,
    fill: '#1b2027',
  })
  c.add(text)
  c.setActiveObject(text)
  c.requestRenderAll()
  syncCounts()
  void text
    .loadFont()
    .then(() => {
      c.requestRenderAll()
      message.success('FontText 已就绪')
    })
    .catch((error: unknown) => {
      message.error(`字体加载失败：${error instanceof Error ? error.message : String(error)}`)
    })
}

function removeSelected() {
  const c = canvas.value
  if (!c) return
  const active = c.getActiveObjects()
  if (!active.length) {
    message.warning('没有选中任何对象')
    return
  }
  c.discardActiveObject()
  active.forEach((obj: FabricObject) => c.remove(obj))
  c.requestRenderAll()
  syncCounts()
  message.success(`已删除 ${active.length} 个对象`)
}

function clearAll() {
  const c = canvas.value
  if (!c) return
  c.clear()
  c.backgroundColor = '#ffffff'
  c.requestRenderAll()
  syncCounts()
  message.info('画布已清空')
}

function bringToFront() {
  const c = canvas.value
  if (!c) return
  c.getActiveObjects().forEach((obj) => c.bringObjectToFront(obj))
  c.requestRenderAll()
}

function sendToBack() {
  const c = canvas.value
  if (!c) return
  c.getActiveObjects().forEach((obj) => c.sendObjectToBack(obj))
  c.requestRenderAll()
}

function download(name: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

function exportJSON() {
  const c = canvas.value
  if (!c) return
  const json = JSON.stringify(c.toObject(), null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  download('fabric-scene.json', url)
  URL.revokeObjectURL(url)
  message.success('已导出 JSON')
}

function exportPNG() {
  const c = canvas.value
  if (!c) return
  download('fabric-scene.png', c.toDataURL({ format: 'png', multiplier: 2 }))
  message.success('已导出 PNG')
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return

  const c = canvas.value
  if (!c) return
  const active = c.getActiveObject()
  if (active instanceof IText && active.isEditing) return

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault()
    removeSelected()
  }
}

onMounted(() => {
  const el = canvasElRef.value
  const box = workspaceRef.value
  if (!el || !box) return

  const c = new Canvas(el, {
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    selection: true,
    controlsAboveOverlay: true,
  })
  canvas.value = c

  resize()

  const onSelection = () => {
    selectedCount.value = c.getActiveObjects().length
  }
  c.on('selection:created', onSelection)
  c.on('selection:updated', onSelection)
  c.on('selection:cleared', onSelection)
  c.on('object:added', syncCounts)
  c.on('object:removed', syncCounts)

  c.on('mouse:wheel', (opt) => {
    const evt = opt.e
    if (!evt.ctrlKey && !evt.metaKey) return
    evt.preventDefault()
    evt.stopPropagation()
    const next = Math.min(4, Math.max(0.2, c.getZoom() * (1 - evt.deltaY / 600)))
    c.zoomToPoint(c.getViewportPoint(evt), next)
    c.requestRenderAll()
  })

  resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(box)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  resizeObserver?.disconnect()
  resizeObserver = null
  canvas.value?.dispose()
  canvas.value = null
})
</script>
<template>
  <n-layout has-sider class="editor" content-style="height: 100%">
    <n-layout-sider :width="232" bordered :native-scrollbar="false" content-style="padding: 18px 16px">
      <n-flex vertical :size="18" style="height: 100%" justify="space-between">
        <n-flex vertical :size="18">
          <n-flex align="center" :size="10">
            <span class="dot" />
            <n-flex vertical :size="2">
              <h1>fabric-core</h1>
              <p>Vite 8 · Vue 3.5 · fabric 7</p>
            </n-flex>
          </n-flex>

          <n-flex vertical :size="6">
            <p class="group-title">基础图形</p>
            <n-grid :cols="2" :x-gap="6" :y-gap="6">
              <n-gi v-for="shape in shapes" :key="shape.kind">
                <n-button size="small" block secondary @click="addShape(shape.kind, shape.label)">
                  {{ shape.label }}
                </n-button>
              </n-gi>
            </n-grid>
          </n-flex>

          <n-flex vertical :size="6">
            <p class="group-title">自定义图层</p>
            <n-button size="small" type="primary" block @click="addFontText">FontText（在线字形）</n-button>
            <n-button size="small" block @click="addText">文本（IText）</n-button>
            <n-button size="small" block secondary @click="pickImage">图片（本地上传）</n-button>
            <input ref="fileInputRef" type="file" accept="image/*" hidden @change="onFileChange" />
          </n-flex>

          <n-flex vertical :size="6">
            <p class="group-title">层级</p>
            <n-grid :cols="2" :x-gap="6" :y-gap="6">
              <n-gi>
                <n-button size="small" block :disabled="!hasSelection()" @click="bringToFront">置顶</n-button>
              </n-gi>
              <n-gi>
                <n-button size="small" block :disabled="!hasSelection()" @click="sendToBack">置底</n-button>
              </n-gi>
            </n-grid>
          </n-flex>

          <n-flex vertical :size="6">
            <p class="group-title">操作</p>
            <n-button size="small" type="error" secondary block :disabled="!hasSelection()" @click="removeSelected">
              删除选中
            </n-button>
            <n-button size="small" tertiary block @click="clearAll">清空画布</n-button>
          </n-flex>

          <n-flex vertical :size="6">
            <p class="group-title">导出</p>
            <n-grid :cols="2" :x-gap="6" :y-gap="6">
              <n-gi>
                <n-button size="small" block secondary @click="exportJSON">JSON</n-button>
              </n-gi>
              <n-gi>
                <n-button size="small" block secondary @click="exportPNG">PNG</n-button>
              </n-gi>
            </n-grid>
          </n-flex>
        </n-flex>

        <p class="hint">提示：Delete 删除 · Cmd/Ctrl + 滚轮缩放 · Shift 多选</p>
      </n-flex>
    </n-layout-sider>

    <n-layout style="height: 100%" content-style="display: flex; flex-direction: column; height: 100%;">
      <NLayoutContent style="flex: 1; min-height: 0" :native-scrollbar="false"
        content-style="height: 100%; background: #ffffff;">
        <div ref="workspaceRef" class="workspace">
          <canvas ref="canvasElRef" />
        </div>
      </NLayoutContent>

      <n-layout-footer bordered>
        <n-flex :size="16" align="center" class="statusbar">
          <span>对象 {{ objectCount }}</span>
          <span>选中 {{ selectedCount }}</span>
        </n-flex>
      </n-layout-footer>
    </n-layout>
  </n-layout>
</template>
<style scoped>
.editor {
  height: 100%;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  flex: 0 0 auto;
}

h1 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.02em;
}

p {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
}

.group-title {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.hint {
  line-height: 1.6;
}

.workspace {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.statusbar {
  font-size: 12px;
  color: var(--text-dim);
}
</style>