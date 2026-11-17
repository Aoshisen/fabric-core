<script setup lang="ts">
import type { Canvas, FabricObject } from 'fabric'
import { NEmpty, NFlex } from 'naive-ui'
import PropertyForm from './property/PropertyForm.vue'

defineProps<{ canvas: Canvas | null; object: FabricObject | null }>()
</script>

<template>
  <n-flex vertical :size="10" style="height: 100%">
    <p class="panel-title">属性</p>
    <n-empty v-if="!object" description="选中一个图层查看属性" size="small" style="margin-top: 40px" />
    <PropertyForm v-else :canvas="canvas" :object="object" />
  </n-flex>
</template>

<style scoped>
.panel-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
</style>
