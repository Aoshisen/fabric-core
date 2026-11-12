/**
 * 浏览器入口。
 *
 * 只做一件事：把「浏览器那份 fabric bundle」注入工厂。
 * 字体加载本身没有环境分支 —— 就是 fetch + opentype 解析。
 *
 * node 端请使用 `./node.ts`（对应 `fabric/node` 那份 bundle）。
 */
import * as Fabric from 'fabric'
import { FontManager } from './core/FontManager.ts'
import { createFontText } from './core/createFontText.ts'

/** 浏览器端全局字体管理器 */
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
