/** 基础图形类型（Line 在 fabric 7 已废弃，直线用 Polyline 表示） */
export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polyline' | 'polygon' | 'path'

export type ActionName =
  | 'add-shape'
  | 'add-text'
  | 'add-font-text'
  | 'pick-image'
  | 'front'
  | 'back'
  | 'remove'
  | 'clear'

export interface SidebarItem {
  label: string
  action: ActionName
  /** 透传给事件处理方的参数 */
  payload?: unknown
  /** n-button 的视觉风格 */
  type?: 'default' | 'primary' | 'error'
  /** n-button 的 secondary 变体 */
  secondary?: boolean
  /** n-button 的 tertiary 变体 */
  tertiary?: boolean
  /** 需要选中对象才能点 */
  requiresSelection?: boolean
}

export interface SidebarGroup {
  title: string
  /** 2 = 两列按钮，1 = 纵向铺满 */
  columns: 1 | 2
  items: SidebarItem[]
}

/** 左侧栏的完整配置：只描述「有什么、点了发什么」，不涉及 DOM */
export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    title: '基础图形',
    columns: 2,
    items: [
      { label: '矩形', action: 'add-shape', payload: { kind: 'rect', label: '矩形' }, secondary: true },
      { label: '圆形', action: 'add-shape', payload: { kind: 'circle', label: '圆形' }, secondary: true },
      { label: '椭圆', action: 'add-shape', payload: { kind: 'ellipse', label: '椭圆' }, secondary: true },
      { label: '三角形', action: 'add-shape', payload: { kind: 'triangle', label: '三角形' }, secondary: true },
      { label: '折线', action: 'add-shape', payload: { kind: 'polyline', label: '折线' }, secondary: true },
      { label: '多边形', action: 'add-shape', payload: { kind: 'polygon', label: '多边形' }, secondary: true },
      { label: '路径', action: 'add-shape', payload: { kind: 'path', label: '路径' }, secondary: true },
    ],
  },
  {
    title: '自定义图层',
    columns: 1,
    items: [
      { label: 'FontText（在线字形）', action: 'add-font-text', type: 'primary' },
      { label: '文本（IText）', action: 'add-text' },
      { label: '图片（本地上传）', action: 'pick-image', secondary: true },
    ],
  },
  {
    title: '层级',
    columns: 2,
    items: [
      { label: '置顶', action: 'front', requiresSelection: true },
      { label: '置底', action: 'back', requiresSelection: true },
    ],
  },
  {
    title: '操作',
    columns: 1,
    items: [
      { label: '删除选中', action: 'remove', type: 'error', secondary: true, requiresSelection: true },
      { label: '清空画布', action: 'clear', tertiary: true },
    ],
  },
]
