<script setup lang="ts">
import type { Canvas, FabricObject } from 'fabric'
import { NEmpty, NTabPane, NTabs } from 'naive-ui'
import PropertyForm from './property/PropertyForm.vue'

defineProps<{
  canvas: Canvas | null
  object: FabricObject | null
  /** 画布快照：JSON 与 PNG */
  json: string
  image: string
  tab: string
  /** 切页交给父级，子组件只调用 */
  onTabChange: (value: string) => void
}>()
</script>

<template>
  <n-tabs class="panel-tabs" type="line" size="small" :value="tab" pane-wrapper-style="flex: 1; min-height: 0;"
    pane-style="height: 100%; overflow: auto;" @update:value="onTabChange">
    <n-tab-pane name="property" tab="属性">
      <PropertyForm v-if="object" :canvas="canvas" :object="object" />
      <n-empty v-else description="选中一个图层查看属性" size="small" style="margin-top: 40px" />
    </n-tab-pane>

    <n-tab-pane name="preview" tab="预览">
      <div class="preview">
        <p class="sub-title">图片预览</p>
        <div class="image-box">
          <img v-if="image" :src="image" alt="画布预览" />
          <span v-else class="empty">暂无内容</span>
        </div>

        <p class="sub-title">JSON</p>
        <pre class="json">{{ json }}</pre>
      </div>
    </n-tab-pane>
  </n-tabs>
</template>

<style scoped>
.panel-tabs {
  height: 100%;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

.sub-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.json {
  flex: 1;
  min-height: 120px;
  margin: 0;
  padding: 8px 10px;
  overflow: auto;
  border-radius: 6px;
  background: var(--panel-2);
  color: var(--text-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre;
}

.image-box {
  flex: 0 0 auto;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 6px;
  background: var(--panel-2);
}

.image-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}

.empty {
  font-size: 12px;
  color: var(--text-dim);
}
</style>
