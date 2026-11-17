<script setup lang="ts">
import { NButton, NFlex, NSpace, NUpload, type UploadFileInfo } from 'naive-ui'
import type { SidebarGroup, SidebarItem } from '../config/sidebar.ts'

const props = defineProps<{
  group: SidebarGroup
  hasSelection: boolean
  /** 普通按钮：交给父级分发 action */
  onSelect: (item: SidebarItem) => void
  /** 上传按钮：选中文件后交给父级加载 */
  onUpload: (file: File) => void
}>()

function buttonProps(item: SidebarItem) {
  return {
    size: 'small' as const,
    block: true,
    type: item.type ?? 'default',
    secondary: item.secondary,
    tertiary: item.tertiary,
    disabled: item.requiresSelection && !props.hasSelection,
  }
}

function onUploadChange(options: { file: UploadFileInfo }) {
  const file = options.file.file
  if (file) props.onUpload(file)
}
</script>

<template>
  <n-flex vertical :size="6">
    <p class="group-title">{{ group.title }}</p>

    <n-space :size="6" wrap :item-style="{ flex: group.columns === 2 ? '1 1 calc(50% - 3px)' : '1 1 100%' }">
      <template v-for="item in group.items" :key="item.action + item.label">
        <n-upload
          v-if="item.action === 'pick-image'"
          :show-file-list="false"
          accept="image/*"
          trigger-style="width: 100%"
          @change="onUploadChange"
        >
          <n-button v-bind="buttonProps(item)">{{ item.label }}</n-button>
        </n-upload>
        <n-button
          v-else
          v-bind="buttonProps(item)"
          @click="onSelect(item)"
        >
          {{ item.label }}
        </n-button>
      </template>
    </n-space>
  </n-flex>
</template>

<style scoped>
.group-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
</style>
