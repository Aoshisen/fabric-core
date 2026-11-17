<script setup lang="ts">
import type { Canvas, FabricObject } from 'fabric'
import { NDivider, NForm, NSpace } from 'naive-ui'
import { computed } from 'vue'
import PropertyField from './PropertyField.vue'
import { BASE_SECTIONS, LAYER_SECTIONS } from '../../config/property_form.ts'
import { useObjectModel } from '../../composables/useObjectModel.ts'

const props = defineProps<{ canvas: Canvas | null; object: FabricObject | null }>()

const { model } = useObjectModel({
  canvas: () => props.canvas,
  object: () => props.object,
})

const sections = computed(() => {
  const object = props.object
  if (!object) return []
  return [...BASE_SECTIONS, ...LAYER_SECTIONS].filter((section) => section.match(object))
})
</script>

<template>
  <n-form label-placement="left" :label-width="62" size="small" :show-feedback="false">
    <n-space vertical :size="14" style="width: 100%">
      <n-space v-for="(section, index) in sections" :key="index" vertical :size="10" style="width: 100%">
        <n-divider v-if="section.title" style="margin: 0">{{ section.title }}</n-divider>
        <PropertyField v-for="field in section.fields" :key="`${String(field.key)}-${field.label}`" :field="field"
          :model="model" :object="object" />
      </n-space>
    </n-space>
  </n-form>
</template>