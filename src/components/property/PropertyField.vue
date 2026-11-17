<script setup lang="ts">
import type { FabricObject } from 'fabric'
import { NFlex, NFormItem, NInputNumber, NTag } from 'naive-ui'
import { computed } from 'vue'
import { FIELD_COMPONENTS, FIELD_DEFAULT_PROPS, type FieldDef, type ShapeModel } from '../../config/property_form.ts'

const props = defineProps<{ field: FieldDef; model: ShapeModel; object: FabricObject | null }>()

const keys = computed<Array<keyof ShapeModel>>(() => {
  const key = props.field.key
  if (!key) return []
  return Array.isArray(key) ? [...key] : [key]
})
const isPair = computed(() => Array.isArray(props.field.key))
const component = computed(() => FIELD_COMPONENTS[props.field.kind])
const controlProps = computed(() => ({
  ...FIELD_DEFAULT_PROPS[props.field.kind],
  ...props.field.props,
}))

const value = computed({
  get: () => {
    const key = keys.value[0]
    return key ? props.model[key] : undefined
  },
  set: (next) => {
    const key = keys.value[0]
    if (key) props.model[key] = next as never
  },
})

function pairValue(index: number): number | undefined {
  const current = props.model[keys.value[index] as keyof ShapeModel]
  return typeof current === 'number' ? current : undefined
}

function setPairValue(index: number, next: number | null) {
  props.model[keys.value[index] as keyof ShapeModel] = (next ?? 0) as never
}

const displayText = computed(() => {
  const object = props.object
  if (!object) return ''
  if (props.field.display) return props.field.display(object, props.model) ?? ''
  const key = keys.value[0]
  const current = key ? props.model[key] : undefined
  return current === undefined ? '' : String(current)
})
</script>

<template>
  <n-form-item :label="field.label">
    <n-flex v-if="isPair" :size="10" style="width: 100%">
      <n-input-number v-for="(key, index) in keys" :key="key" :value="pairValue(index)"
        v-bind="FIELD_DEFAULT_PROPS.number" @update:value="(next) => setPairValue(index, next)" />
    </n-flex>
    <n-tag v-else-if="field.kind === 'tag'" v-bind="controlProps">{{ displayText }}</n-tag>
    <span v-else-if="field.kind === 'readonly'" class="readonly" :title="String(displayText)">
      {{ displayText }}
    </span>
    <component v-else :is="component" v-model:value="value" v-bind="controlProps" />
  </n-form-item>
</template>

<style scoped>
.readonly {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-dim);
}
</style>