/**
 * 渲染层（FontText）的类型定义。
 * 字体加载相关的类型在 src/core/font/types.ts。
 */

/** 字形绘制方式 */
export type GlyphRenderMode =
  /** 所有字形合成一条路径，一次 fill —— 调用最少，但字形相交时 nonzero 规则可能互相抵消 */
  | 'merged'
  /** 每个字形单独 beginPath + fill —— 绝对正确，调用次数随字形数增加 */
  | 'glyph'