<script setup lang="ts">
defineProps<{
  collapsed: boolean
  /** 拖拽 / 点击逻辑由父级 composable 提供 */
  onPointerDown: (e: PointerEvent) => void
}>()
</script>

<template>
  <div class="panel-resizer" :class="{ 'is-collapsed': collapsed }" title="拖动调整宽度，单击收起 / 展开"
    @pointerdown="onPointerDown">
    <span class="grip" />
  </div>
</template>

<style scoped>
.panel-resizer {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
  transition: background 0.15s ease;
}

.panel-resizer:hover {
  background: var(--panel-2);
}

.grip {
  width: 2px;
  height: 32px;
  border-radius: 1px;
  background: var(--line);
  transition: background 0.15s ease;
}

.panel-resizer:hover .grip {
  background: var(--accent);
}
</style>
