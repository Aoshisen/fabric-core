<script setup lang="ts">
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { Canvas, IText, type FabricObject } from 'fabric'
import { NFlex, NLayout, NLayoutContent, NLayoutFooter, NLayoutSider, useMessage } from 'naive-ui'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useCanvasPreview } from '../composables/useCanvasPreview.ts'
import { useEditorActions } from '../composables/useEditorActions.ts'
import { usePanelResize } from '../composables/usePanelResize.ts'
import EditorSidebar from './EditorSidebar.vue'
import PanelResizer from './PanelResizer.vue'
import PropertyPanel from './PropertyPanel.vue'

const workspaceRef = ref<HTMLDivElement | null>(null)
const canvasElRef = ref<HTMLCanvasElement | null>(null)
const canvas = shallowRef<Canvas | null>(null)
const activeObject = shallowRef<FabricObject | null>(null)
const message = useMessage()

const objectCount = ref(0)
const selectedCount = ref(0)

// 左右侧栏：拖动改宽 + 单击收起
const {
  width: leftWidth,
  collapsed: leftCollapsed,
  resizing: leftResizing,
  onPointerDown: startLeftResize,
} = usePanelResize({ initial: 232, min: 180, max: 380 })

const {
  width: rightWidth,
  collapsed: rightCollapsed,
  resizing: rightResizing,
  onPointerDown: startRightResize,
} = usePanelResize({ initial: 272, min: 240, max: 480, direction: -1 })

// 右侧「预览」tab 的数据，切到该 tab 才生成缩略图
const activeTab = ref('property')
const { json: previewJson, image: previewImage, sync: syncPreview } = useCanvasPreview({
  canvas,
  enabled: () => activeTab.value === 'preview',
})

watch(activeTab, (tab) => {
  if (tab === 'preview') syncPreview()
})

function syncCounts() {
  const c = canvas.value
  if (!c) return
  objectCount.value = c.getObjects().length
  const active = c.getActiveObjects()
  selectedCount.value = active.length
  activeObject.value = active.length === 1 ? active[0] : null
}

// 所有命令都在这个 composable 里，FabricEditor 只负责画布生命周期与编排
const { onAction, addImage, removeSelected } = useEditorActions({
  canvas,
  message,
  onChanged: syncCounts,
})

function resize() {
  const el = workspaceRef.value
  const c = canvas.value
  if (!el || !c) return
  const { width, height } = el.getBoundingClientRect()
  if (!width || !height) return
  c.setDimensions({ width: Math.floor(width), height: Math.floor(height) })
  c.requestRenderAll()
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

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

  const onSelection = () => syncCounts()
  c.on('selection:created', onSelection)
  c.on('selection:updated', onSelection)
  c.on('selection:cleared', onSelection)

  // 场景变化后刷新右侧预览
  const onSceneChange = () => {
    syncCounts()
    syncPreview()
  }
  c.on('object:added', onSceneChange)
  c.on('object:removed', onSceneChange)
  c.on('object:modified', syncPreview)
  c.on('text:changed', syncPreview)

  syncCounts()
  syncPreview()

  c.on('mouse:wheel', (opt) => {
    const evt = opt.e
    if (!evt.ctrlKey && !evt.metaKey) return
    evt.preventDefault()
    evt.stopPropagation()
    const next = Math.min(4, Math.max(0.2, c.getZoom() * (1 - evt.deltaY / 600)))
    c.zoomToPoint(c.getViewportPoint(evt), next)
    c.requestRenderAll()
  })
})

// 画布随容器尺寸变化，键盘事件在窗口级监听
useResizeObserver(workspaceRef, () => resize())
useEventListener(window, 'keydown', handleKeydown)

onBeforeUnmount(() => {
  canvas.value?.dispose()
  canvas.value = null
})
</script>

<template>
  <n-layout has-sider class="editor" :class="{ 'is-resizing': leftResizing || rightResizing }"
    content-style="height: 100%">
    <n-layout-sider :width="leftWidth" :collapsed="leftCollapsed" :collapsed-width="0" :show-collapsed-content="false"
      collapse-mode="width" bordered :native-scrollbar="false" content-style="padding: 18px 16px">
      <EditorSidebar :object-count="objectCount" :selected-count="selectedCount" :on-action="onAction"
        :on-add-image="addImage" />
    </n-layout-sider>

    <PanelResizer :collapsed="leftCollapsed" :on-pointer-down="startLeftResize" />

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

    <PanelResizer :collapsed="rightCollapsed" :on-pointer-down="startRightResize" />

    <n-layout-sider sider-placement="right" :width="rightWidth" :collapsed="rightCollapsed" :collapsed-width="0"
      :show-collapsed-content="false" collapse-mode="width" bordered :native-scrollbar="false"
      content-style="padding: 16px">
      <PropertyPanel :canvas="canvas" :object="activeObject" :json="previewJson" :image="previewImage" :tab="activeTab"
        :on-tab-change="(value) => (activeTab = value)" />
    </n-layout-sider>
  </n-layout>
</template>

<style scoped>
.editor {
  height: 100%;
  overflow: hidden;
}

/* 拖动时关掉侧栏宽度过渡，宽度跟手；全局光标由根节点接管 */
.editor.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.editor.is-resizing :deep(.n-layout-sider) {
  transition: none !important;
}

.editor.is-resizing :deep(canvas) {
  cursor: col-resize !important;
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
