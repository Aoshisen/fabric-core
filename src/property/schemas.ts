import { Circle, Ellipse, FabricImage, IText, Rect, Textbox, type FabricObject } from 'fabric'
import { FontText } from '../libs/index.ts'
import type { SectionDef } from './types.ts'

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