/**
 * 字体加载层的类型定义。
 * 这一层不允许 import 任何浏览器或 node 的运行时 API。
 */

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot' | 'unknown'

/**
 * 'Font.parse()' 的产物。
 *
 * 由一条正则从 URL 里同时解析出「字体名」与「扩展名 / 格式」，
 * 再统一转成可直接使用的 CSS 片段：
 * - 'src' 是 CSS 'src' 值，需要降级到原生 '@font-face' 时用
 * - 'css' 是完整 '@font-face' 规则，可注入 <style> 或导出到服务端 HTML
 */
export interface FontURLDescriptor {
  /** trim 后的原始 URL（query / hash 保留，因为它们属于真实请求地址） */
  url: string
  /** 解码后的文件名，不含 query / hash */
  fileName: string
  /** 去掉字体扩展名后的原始名字（未做 CSS 安全化） */
  name: string
  /** 由 name 转出的安全 CSS font-family */
  family: string
  /** 小写扩展名，无匹配时为空串 */
  extension: string
  /** 归一化格式 */
  format: FontFormat
  /** CSS format() 的取值：truetype / opentype / woff / woff2 / embedded-opentype */
  cssFormat: string
  /** CSS src 值，例如 url("...ttf") format("truetype") */
  src: string
  /** 完整 @font-face 规则 */
  css: string
}


/** 字体实体的状态视图：由 Promise 与字形表推导，不单独存储 */
export type FontStatus = 'loading' | 'loaded' | 'error'