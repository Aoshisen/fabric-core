import type { Component } from 'vue'
import { NColorPicker, NInput, NInputNumber, NSelect, NSlider, NTag } from 'naive-ui'
import type { FieldKind } from './types.ts'

/** 字段类型 → 展示组件 */
export const FIELD_COMPONENTS: Partial<Record<FieldKind, Component>> = {
  number: NInputNumber,
  color: NColorPicker,
  slider: NSlider,
  select: NSelect,
  text: NInput,
  textarea: NInput,
  tag: NTag,
}

/** 字段类型 → 控件默认 props，schema 里的 props 会覆盖它 */
export const FIELD_DEFAULT_PROPS: Record<FieldKind, Record<string, unknown>> = {
  number: { size: 'small', showButton: false, style: 'width: 100%' },
  numberPair: { size: 'small', showButton: false, style: 'width: 100%' },
  color: { size: 'small', showAlpha: false },
  slider: {},
  select: { size: 'small' },
  text: { size: 'small' },
  textarea: { size: 'small', autosize: { minRows: 2, maxRows: 4 } },
  tag: { size: 'small', bordered: false },
  readonly: {},
}
