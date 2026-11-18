<script setup lang="ts">
import { NFlex } from 'naive-ui'
import { SIDEBAR_GROUPS, type SidebarItem } from '../config/sidebar.ts'
import SidebarGroup from './SidebarGroup.vue'

const props = defineProps<{
  objectCount: number
  selectedCount: number
  /** 按钮动作交给父级执行，子组件只调用 */
  onAction: (item: SidebarItem) => void
  /** 图片文件交给父级加载 */
  onAddImage: (file: File) => void
}>()


const hasSelection = () => props.selectedCount > 0

function onSelect(item: SidebarItem) {
  props.onAction(item)
}
const hint = "提示：Delete 删除 · Cmd/Ctrl + 滚轮缩放 · Shift 多选"
const title = "fabric-core"
const secondary_title = "Vite 8 · Vue 3.5 · fabric 7"
</script>

<template>
  <n-flex vertical :size="18" style="height: 100%" justify="space-between">
    <n-flex vertical :size="18">
      <n-flex align="center" :size="10">
        <span class="dot" />
        <n-flex vertical :size="2">
          <h1>{{ title }}</h1>
          <p>{{ secondary_title }}</p>
        </n-flex>
      </n-flex>

      <SidebarGroup v-for="group in SIDEBAR_GROUPS" :key="group.title" :group="group" :has-selection="hasSelection()"
        :on-select="onSelect" :on-upload="onAddImage" />
    </n-flex>

    <p class="hint">{{ hint }}</p>
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

h1 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: var(--text);
}

p {
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
}

.hint {
  line-height: 1.6;
}
</style>