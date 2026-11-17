<script setup lang="ts">
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui'
import FabricEditor from './components/FabricEditor.vue'
</script>

<template>
  <n-config-provider :theme="darkTheme" class="app-shell">
    <n-message-provider>
      <FabricEditor />
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
/* NConfigProvider 会渲染一层 div，不撑满的话里层的 height: 100% 全部失效 */
.app-shell {
  height: 100%;
}
</style>
