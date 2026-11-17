<script setup lang="ts">
import { NButton, NFlex, NGi, NGrid } from 'naive-ui'
import { ref } from 'vue'

const props = defineProps<{ objectCount: number; selectedCount: number }>()
void props

const emit = defineEmits<{
  (e: 'add-shape', kind: ShapeKind, label: string): void
  (e: 'add-text'): void
  (e: 'add-font-text'): void
  (e: 'add-image', file: File): void
  (e: 'remove'): void
  (e: 'clear'): void
  (e: 'front'): void
  (e: 'back'): void
  (e: 'export-json'): void
  (e: 'export-png'): void
}>()

type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polyline' | 'polygon' | 'path'

/** Line 在 fabric 7 已废弃，直线用 Polyline 表示 */
const shapes: Array<{ kind: ShapeKind; label: string }> = [
  { kind: 'rect', label: '矩形' },
  { kind: 'circle', label: '圆形' },
  { kind: 'ellipse', label: '椭圆' },
  { kind: 'triangle', label: '三角形' },
  { kind: 'polyline', label: '折线' },
  { kind: 'polygon', label: '多边形' },
  { kind: 'path', label: '路径' },
]

const fileInputRef = ref<HTMLInputElement | null>(null)

function pickImage() {
  fileInputRef.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('add-image', file)
}

const hasSelection = () => props.selectedCount > 0
</script>

<template>
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
            <n-button size="small" block secondary @click="emit('add-shape', shape.kind, shape.label)">
              {{ shape.label }}
            </n-button>
          </n-gi>
        </n-grid>
      </n-flex>

      <n-flex vertical :size="6">
        <p class="group-title">自定义图层</p>
        <n-button size="small" type="primary" block @click="emit('add-font-text')">
          FontText（在线字形）
        </n-button>
        <n-button size="small" block @click="emit('add-text')">文本（IText）</n-button>
        <n-button size="small" block secondary @click="pickImage">图片（本地上传）</n-button>
        <input ref="fileInputRef" type="file" accept="image/*" hidden @change="onFileChange" />
      </n-flex>

      <n-flex vertical :size="6">
        <p class="group-title">层级</p>
        <n-grid :cols="2" :x-gap="6" :y-gap="6">
          <n-gi>
            <n-button size="small" block :disabled="!hasSelection()" @click="emit('front')">置顶</n-button>
          </n-gi>
          <n-gi>
            <n-button size="small" block :disabled="!hasSelection()" @click="emit('back')">置底</n-button>
          </n-gi>
        </n-grid>
      </n-flex>

      <n-flex vertical :size="6">
        <p class="group-title">操作</p>
        <n-button size="small" type="error" secondary block :disabled="!hasSelection()" @click="emit('remove')">
          删除选中
        </n-button>
        <n-button size="small" tertiary block @click="emit('clear')">清空画布</n-button>
      </n-flex>

      <n-flex vertical :size="6">
        <p class="group-title">导出</p>
        <n-grid :cols="2" :x-gap="6" :y-gap="6">
          <n-gi>
            <n-button size="small" block secondary @click="emit('export-json')">JSON</n-button>
          </n-gi>
          <n-gi>
            <n-button size="small" block secondary @click="emit('export-png')">PNG</n-button>
          </n-gi>
        </n-grid>
      </n-flex>
    </n-flex>

    <p class="hint">提示：Delete 删除 · Cmd/Ctrl + 滚轮缩放 · Shift 多选</p>
  </n-flex>
</template>

<style scoped>
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  flex: 0 0 auto;
}

h1 { margin: 0; font-size: 15px; letter-spacing: 0.02em; color: var(--text); }
p { margin: 0; font-size: 11px; color: var(--text-dim); }

.group-title {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.hint { line-height: 1.6; }
</style>
