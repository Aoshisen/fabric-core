import type { FontDriver } from '../core/types.ts'

/**
 * 浏览器端字体驱动：FontFace API 注册到 document.fonts。
 *
 * 关键点：
 * - 在线字体必须允许跨域（响应带 Access-Control-Allow-Origin），否则 load() 会失败
 * - 支持 ttf / otf / woff / woff2，由浏览器自身解码
 * - 注册进 document.fonts 后，fabric 用 CSS font-family 即可直接使用
 */
export function createBrowserDriver(): FontDriver {
  return {
    runtime: 'browser',

    async load({ url, family }) {
      if (
        typeof document === 'undefined' ||
        !document.fonts ||
        typeof FontFace === 'undefined'
      ) {
        throw new Error('[font] 当前环境不支持 FontFace API，请在浏览器中运行')
      }

      const face = new FontFace(family, `url(${JSON.stringify(url)})`)
      try {
        await face.load()
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `[font] 字体加载失败 ${url}（请检查 URL 是否有效、以及字体的 CORS 响应头）：${reason}`,
        )
      }

      document.fonts.add(face)

      return {
        dispose: () => {
          document.fonts.delete(face)
        },
      }
    },
  }
}

export const browserFontDriver = createBrowserDriver()
