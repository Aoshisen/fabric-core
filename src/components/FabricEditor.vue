<script setup lang="ts">
import {
  Canvas,
  Circle,
  FabricText,
  IText,
  Rect,
  Shadow,
  type FabricObject,
} from 'fabric'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { Font, fontManager, FontText } from '../libs/index.ts'

const workspaceRef = ref<HTMLDivElement | null>(null)
const canvasElRef = ref<HTMLCanvasElement | null>(null)
const canvas = shallowRef<Canvas | null>(null)

const objectCount = ref(0)
const selectedCount = ref(0)
const message = ref('就绪')

let resizeObserver: ResizeObserver | null = null
let cascade = 0

/** 种子场景里 FontText 用的在线字体（woff，CDN 带 CORS，含中文与拉丁字形） */
const SEED_FONT_URL =
  'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-chinese-simplified-400-normal.woff'
/** 同一份字体注册给原生 canvas 文本用的 family 名 */
const SEED_FONT_NAME = 'SeedNotoSansSC'

/**
 * 把同一份字体文件声明成 @font-face，
 * 这样 FabricText（走 ctx.fillText + 宿主字体）和 FontText（自己解析字形）用的是同一个文件。
 */
function injectSeedFontFace() {
  if (document.querySelector(`style[data-seed-font="${SEED_FONT_NAME}"]`)) return
  const style = document.createElement('style')
  style.dataset.seedFont = SEED_FONT_NAME
  style.textContent = Font.parse(SEED_FONT_URL, SEED_FONT_NAME).css
  document.head.appendChild(style)
}

const accents = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6']
function nextColor() {
  return accents[cascade++ % accents.length]
}

/** fabric 7 起 Shadow 是类，不能再传普通对象 */
function softShadow(blur = 16) {
  return new Shadow({
    color: 'rgba(0,0,0,0.16)',
    blur,
    offsetX: 0,
    offsetY: 6,
  })
}

const hasSelection = computed(() => selectedCount.value > 0)

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

async function seedScene() {
  const c = canvas.value
  if (!c) return
  const w = c.getWidth()
  const h = c.getHeight()
  injectSeedFontFace()

  c.add(
    new Rect({
      left: w / 2 - 300,
      top: h / 2 - 170,
      width: 220,
      height: 150,
      rx: 16,
      ry: 16,
      fill: '#f97316',
      shadow: softShadow(18),
    }),
    new Circle({
      left: w / 2 - 40,
      top: h / 2 - 170,
      radius: 78,
      fill: '#38bdf8',
      shadow: softShadow(18),
    }),
    new IText('双击这里编辑文字', {
      left: w / 2 - 300,
      top: h / 2 + 84,
      fontFamily: 'PingFang SC, sans-serif',
      fontSize: 22,
      fill: '#4f8cff',
    }),
  )

  // 两种文本图层用同一份字体、同样的参数，位置应当完全重合
  const seedText = 'Fabric.js 7'
  const fontSize = 40
  const shared = {
    left: w / 2 - 300,
    top: h / 2 + 20,
    fontSize,
    fill: '#1b2027',
  }

  const glyphText = new FontText(seedText, {
    ...shared,
    font: { name: SEED_FONT_NAME, url: SEED_FONT_URL },
    fontWeight: 'bold',
  })

  try {
    // Font.load() 会把同一份字体注册成 FontFace，FabricText 与 FontText 共用
    await fontManager.get({ url: SEED_FONT_URL, name: SEED_FONT_NAME })
  } catch (error) {
    message.value = `种子字体加载失败：${error instanceof Error ? error.message : String(error)}`
  }

  const fabricText = new FabricText(seedText, { ...shared, fontFamily: SEED_FONT_NAME, fontWeight: "bold" })
  c.add(fabricText, glyphText)
  c.requestRenderAll()

  try {
    await glyphText.loadFont()
  } catch (error) {
    message.value = `FontText 加载失败：${error instanceof Error ? error.message : String(error)}`
    syncCounts()
    return
  }

  c.requestRenderAll()
  syncCounts()

  // 自检：同字体同参数下，两个图层的包围盒应当重合
  // （FontText 现在是 Textbox，width 是盒子宽度，和 FabricText 的内容宽不同，只比位置和高度）
  const a = fabricText.getBoundingRect()
  const bRect = glyphText.getBoundingRect()
  const deltas = {
    height: fabricText.height - glyphText.height,
    left: a.left - bRect.left,
    top: a.top - bRect.top,
  }
  console.info('[seed] FabricText vs FontText 对齐检查', deltas)
  message.value = `对齐检查 Δheight=${deltas.height.toFixed(2)} Δleft=${deltas.left.toFixed(2)} Δtop=${deltas.top.toFixed(2)}`
}

function center() {
  const c = canvas.value
  return c
    ? { x: c.getWidth() / 2, y: c.getHeight() / 2 }
    : { x: 0, y: 0 }
}

function addRect() {
  const c = canvas.value
  if (!c) return
  const { x, y } = center()
  const rect = new Rect({
    left: x - 90 + (cascade % 5) * 12,
    top: y - 60 + (cascade % 5) * 12,
    width: 180,
    height: 120,
    rx: 14,
    ry: 14,
    fill: nextColor(),
    shadow: softShadow(14),
  })
  c.add(rect)
  c.setActiveObject(rect)
  c.requestRenderAll()
  message.value = '已添加矩形'
  syncCounts()
}

function addCircle() {
  const c = canvas.value
  if (!c) return
  const { x, y } = center()
  const circle = new Circle({
    left: x - 70 + (cascade % 5) * 12,
    top: y - 70 + (cascade % 5) * 12,
    radius: 70,
    fill: nextColor(),
    shadow: softShadow(14),
  })
  c.add(circle)
  c.setActiveObject(circle)
  c.requestRenderAll()
  message.value = '已添加圆形'
  syncCounts()
}

function addText() {
  const c = canvas.value
  if (!c) return
  const { x, y } = center()
  const text = new IText('新文本', {
    left: x - 60,
    top: y - 16,
    fontFamily: 'PingFang SC, sans-serif',
    fontSize: 28,
    fill: '#1b2027',
  })
  c.add(text)
  c.setActiveObject(text)
  c.requestRenderAll()
  message.value = '已添加文本，双击可编辑'
  syncCounts()
}

function removeSelected() {
  const c = canvas.value
  if (!c) return
  const active = c.getActiveObjects()
  if (!active.length) {
    message.value = '没有选中任何对象'
    return
  }
  c.discardActiveObject()
  active.forEach((obj: FabricObject) => c.remove(obj))
  c.requestRenderAll()
  message.value = `已删除 ${active.length} 个对象`
  syncCounts()
}

function clearAll() {
  const c = canvas.value
  if (!c) return
  c.clear()
  c.backgroundColor = '#ffffff'
  c.requestRenderAll()
  message.value = '画布已清空'
  syncCounts()
}

function bringToFront() {
  const c = canvas.value
  if (!c) return
  c.getActiveObjects().forEach((obj) => c.bringObjectToFront(obj))
  c.requestRenderAll()
  message.value = '已置顶'
}

function sendToBack() {
  const c = canvas.value
  if (!c) return
  c.getActiveObjects().forEach((obj) => c.sendObjectToBack(obj))
  c.requestRenderAll()
  message.value = '已置底'
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
  message.value = '已导出 JSON'
}

function exportPNG() {
  const c = canvas.value
  if (!c) return
  download('fabric-scene.png', c.toDataURL({ format: 'png', multiplier: 2 }))
  message.value = '已导出 PNG'
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
  void seedScene()

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
  <div class="editor">
    <aside class="sidebar">
      <div class="brand">
        <span class="dot" />
        <div>
          <h1>fabric-core</h1>
          <p>Vite 8 · Vue 3.5 · fabric 7</p>
        </div>
      </div>

      <div class="group">
        <p class="group-title">创建</p>
        <button class="btn" @click="addRect">矩形</button>
        <button class="btn" @click="addCircle">圆形</button>
        <button class="btn" @click="addText">文本</button>
      </div>

      <div class="group">
        <p class="group-title">层级</p>
        <button class="btn" :disabled="!hasSelection" @click="bringToFront">置顶</button>
        <button class="btn" :disabled="!hasSelection" @click="sendToBack">置底</button>
      </div>

      <div class="group">
        <p class="group-title">操作</p>
        <button class="btn danger" :disabled="!hasSelection" @click="removeSelected">
          删除选中
        </button>
        <button class="btn" @click="clearAll">清空画布</button>
      </div>

      <div class="group">
        <p class="group-title">导出</p>
        <button class="btn" @click="exportJSON">JSON</button>
        <button class="btn" @click="exportPNG">PNG</button>
      </div>

      <p class="hint">提示：Delete 删除 · Cmd/Ctrl + 滚轮缩放 · Shift 多选</p>
    </aside>

    <main class="main">
      <div ref="workspaceRef" class="workspace">
        <canvas ref="canvasElRef" />
      </div>
      <footer class="statusbar">
        <span>对象 {{ objectCount }}</span>
        <span>选中 {{ selectedCount }}</span>
        <span class="msg">{{ message }}</span>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 232px;
  flex: 0 0 232px;
  background: var(--panel);
  border-right: 1px solid var(--line);
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
}

.brand .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  flex: 0 0 auto;
}

.brand h1 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.02em;
}

.brand p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-dim);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-title {
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.btn {
  padding: 8px 10px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  text-align: left;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.btn:hover:not(:disabled) {
  background: #2a323d;
  border-color: #3b4657;
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn.danger {
  color: #ff8a8a;
}

.hint {
  margin: auto 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-dim);
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.workspace {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #ffffff;
  min-height: 0;
}

.statusbar {
  display: flex;
  gap: 16px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-dim);
  background: var(--panel);
  border-top: 1px solid var(--line);
}

.statusbar .msg {
  margin-left: auto;
  color: var(--accent);
}
</style>
