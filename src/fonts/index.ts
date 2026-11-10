/**
 * 浏览器入口。
 *
 * 注入浏览器那份 fabric bundle + FontFace 驱动。
 * node 端请使用 `./node.ts`（对应 `fabric/node` + node-canvas 驱动）。
 */
import * as Fabric from 'fabric'
import { FontManager } from './core/FontManager.ts'
import { createFontTextBox } from './core/createFontTextBox.ts'
import { browserFontDriver } from './drivers/browser.ts'

export const runtime = 'browser' as const

/** 浏览器端全局字体注册表 */
export const fontManager = new FontManager(browserFontDriver)

/** 接受在线字体 URL 的自定义 TextBox */
export const FontTextBox = createFontTextBox({
  fabric: Fabric,
  manager: fontManager,
})

export { FontManager } from './core/FontManager.ts'
export { createFontTextBox } from './core/createFontTextBox.ts'
export { deriveFontFamily, getFontFileName, getFontFormat } from './core/deriveFontFamily.ts'
export { createBrowserDriver, browserFontDriver } from './drivers/browser.ts'
export { detectRuntime, assertRuntime } from './env.ts'
export type { FontTextBoxOptions, FontTextBoxInstance } from './core/createFontTextBox.ts'
export type {
  FontDriver,
  FontFormat,
  FontLoadRequest,
  FontLoadResult,
  FontManagerListener,
  FontRecord,
  FontRuntime,
  FontStatus,
} from './core/types.ts'
