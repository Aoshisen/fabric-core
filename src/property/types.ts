import type { FabricObject } from 'fabric'

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

/** 字段用哪种控件渲染（fields.ts 里有映射表） */
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
