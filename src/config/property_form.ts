/**
 * 属性表单的「唯一配置来源」：
 * - 表单模型 / 字段 / 分组的类型
 * - 字段类型 → 展示组件映射
 * - 每种图层的字段 schema
 */
import { Circle, Ellipse, FabricImage, IText, Rect, Textbox, type FabricObject } from 'fabric'
import { NColorPicker, NInput, NInputNumber, NSelect, NSlider, NTag } from 'naive-ui'
import type { Component } from 'vue'
import { FontText } from '../libs/index.ts'

/** 表单模型：只放属性面板会编辑的字段 */
export interface ShapeModel {
  left?: number
  top?: number
  angle?: number
  opacity?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  width?: number
  height?: number
  rx?: number
  ry?: number
  radius?: number
  text?: string
  fontSize?: number
  lineHeight?: number
  charSpacing?: number
  textAlign?: string
  fontWeight?: number
}

/** 字段用哪种控件渲染（见下方 FIELD_COMPONENTS 映射表） */
export type FieldKind =
  | 'number'
  /** 两个数字并排，例如 X / Y、rx / ry */
  | 'numberPair'
  | 'color'
  | 'slider'
  | 'select'
  | 'text'
  | 'textarea'
  | 'tag'
  | 'readonly'

export interface FieldDef {
  /** 绑定的模型字段；成对字段用数组；tag / readonly 可以省略 */
  key?: keyof ShapeModel | [keyof ShapeModel, keyof ShapeModel]
  label: string
  kind: FieldKind
  /** 传给控件的额外 props（min / step / options …） */
  props?: Record<string, unknown>
  /** tag / readonly 的展示文案 */
  display?: (object: FabricObject, model: ShapeModel) => string | number | undefined
}

/** 一组字段；match 决定这组字段对哪些图层生效（可以叠加） */
export interface SectionDef {
  title?: string
  match: (object: FabricObject) => boolean
  fields: FieldDef[]
}

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

const isCircle = (object: FabricObject) => object instanceof Circle
const isEllipse = (object: FabricObject) => object instanceof Ellipse

/** 所有图层都有的字段 */
export const BASE_SECTIONS: SectionDef[] = [
  {
    match: () => true,
    fields: [
      { key: ['left', 'top'], label: 'X / Y', kind: 'numberPair' },
      { key: 'angle', label: '角度', kind: 'number', props: { step: 1 } },
      { key: 'opacity', label: '不透明', kind: 'slider', props: { min: 0, max: 1, step: 0.01 } },
    ],
  },
  {
    match: () => true,
    fields: [
      { key: 'fill', label: '填充', kind: 'color' },
      { key: 'stroke', label: '描边', kind: 'color' },
      { key: 'strokeWidth', label: '线宽', kind: 'number', props: { min: 0, step: 1 } },
    ],
  },
]

/** 按图层类型追加的字段 */
export const LAYER_SECTIONS: SectionDef[] = [
  {
    title: '尺寸',
    match: (object) => object instanceof Rect,
    fields: [
      { key: 'width', label: '宽', kind: 'number', props: { min: 1 } },
      { key: 'height', label: '高', kind: 'number', props: { min: 1 } },
      { key: ['rx', 'ry'], label: '圆角', kind: 'numberPair', props: { min: 0 } },
    ],
  },
  {
    title: '尺寸',
    match: isCircle,
    fields: [{ key: 'radius', label: '半径', kind: 'number', props: { min: 1 } }],
  },
  {
    title: '尺寸',
    /** Circle 继承 Ellipse，这里要排掉 */
    match: (object) => isEllipse(object) && !isCircle(object),
    fields: [{ key: ['rx', 'ry'], label: 'rx / ry', kind: 'numberPair', props: { min: 1 } }],
  },
  {
    title: '尺寸',
    match: (object) => object instanceof Textbox,
    fields: [{ key: 'width', label: '宽', kind: 'number', props: { min: 1 } }],
  },
  {
    title: '尺寸',
    match: (object) => object instanceof FabricImage,
    fields: [
      {
        label: '原始尺寸',
        kind: 'readonly',
        display: (object) => {
          const image = object as FabricImage
          return `${image.width} × ${image.height}`
        },
      },
    ],
  },
  {
    title: '文本',
    match: (object) => object instanceof IText,
    fields: [
      { key: 'text', label: '内容', kind: 'textarea' },
      { key: 'fontSize', label: '字号', kind: 'number', props: { min: 1 } },
      { key: 'lineHeight', label: '行高', kind: 'number', props: { min: 0.5, step: 0.1 } },
      { key: 'charSpacing', label: '字距', kind: 'number', props: { step: 10 } },
      {
        key: 'textAlign',
        label: '对齐',
        kind: 'select',
        props: {
          options: [
            { label: '左对齐', value: 'left' },
            { label: '居中', value: 'center' },
            { label: '右对齐', value: 'right' },
            { label: '两端', value: 'justify' },
          ],
        },
      },
      {
        key: 'fontWeight',
        label: '字重',
        kind: 'select',
        props: {
          options: [
            { label: '常规', value: 400 },
            { label: '粗体', value: 700 },
          ],
        },
      },
    ],
  },
  {
    title: '在线字体',
    match: (object) => object instanceof FontText,
    fields: [
      {
        label: '字体',
        kind: 'tag',
        display: (object) => (object as FontText).font?.name,
      },
      {
        label: '地址',
        kind: 'readonly',
        display: (object) => (object as FontText).font?.url,
      },
    ],
  },
]