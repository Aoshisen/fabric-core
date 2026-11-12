/**
 * node 入口。
 *
 * 只注入 `fabric/node` 那份 bundle；字体加载逻辑与浏览器完全一致
 * （fetch + opentype 解析），所以这里没有 registerFont / 落盘缓存之类的分支。
 *
 * ⚠️ 不要和浏览器入口混用：fabric 与 fabric/node 的 classRegistry 是两份，
 * 混用会导致 enlivenObjects 反序列化时找不到 FontText。
 */
import * as Fabric from 'fabric/node'
import { FontManager } from './core/FontManager.ts'
import { createFontText } from './core/createFontText.ts'

/** node 端进程级字体管理器 */
export const fontManager = new FontManager()

/** 用 opentype 字形路径渲染的文字图层（单对象，不拆字） */
export const FontText = createFontText({ fabric: Fabric, manager: fontManager })

export { Font } from './core/Font.ts'
export { FontManager } from './core/FontManager.ts'
export { createFontText } from './core/createFontText.ts'
export { deriveFontFamily, getFontFileName, getFontFormat } from './core/FontManager.ts'
export type { FontTextOptions, FontTextInstance, CreateFontTextOptions } from './core/createFontText.ts'
export type { LayoutOptions, LayoutResult, LayoutLine, PlacedGlyph, TextAlign } from './core/layout.ts'
export type { OtFont, OtGlyph, OtPath, OtCommand } from './core/opentype.ts'
export type {
  FontFormat,
  FontLoadOptions,
  FontManagerListener,
  FontManagerOptions,
  FontRecord,
  FontStatus,
  FontURLDescriptor,
  GlyphRenderMode,
} from './core/types.ts'
