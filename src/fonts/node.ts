/**
 * node 入口。
 *
 * 注入 `fabric/node` 那份 bundle + node-canvas 驱动。
 * ⚠️ 不要和浏览器入口混用：fabric 与 fabric/node 的 classRegistry 是两份，
 * 混用会导致 enlivenObjects 反序列化时找不到 FontTextBox。
 */
import * as Fabric from 'fabric/node'
import { FontManager } from './core/FontManager.ts'
import { createFontTextBox } from './core/createFontTextBox.ts'
import { nodeFontDriver } from './drivers/node.ts'

export const runtime = 'node' as const

/** node 端进程级字体注册表 */
export const fontManager = new FontManager(nodeFontDriver)

/** 接受在线字体 URL 的自定义 TextBox */
export const FontTextBox = createFontTextBox({
  fabric: Fabric,
  manager: fontManager,
})

export { FontManager } from './core/FontManager.ts'
export { createFontTextBox } from './core/createFontTextBox.ts'
export { deriveFontFamily, getFontFileName, getFontFormat } from './core/deriveFontFamily.ts'
export { createNodeDriver, nodeFontDriver } from './drivers/node.ts'
export type { NodeFontDriverOptions } from './drivers/node.ts'
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
