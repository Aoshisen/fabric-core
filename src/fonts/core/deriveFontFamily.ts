import type { FontFormat } from './types.ts'

const FONT_EXTENSION = /\.(woff2?|ttf|otf|eot)$/i

/** 从 URL 中取出文件名（忽略 query / hash，兼容相对路径与编码字符） */
export function getFontFileName(url: string): string {
  let pathname = String(url ?? '').trim()
  try {
    pathname = new URL(pathname, 'http://font.local').pathname
  } catch {
    // 不是合法 URL 时按普通路径处理
  }
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // 保留原始 pathname
  }
  const name = pathname.split(/[\\/]/).pop() ?? ''
  return name.split(/[?#]/)[0]
}

export function getFontFormat(url: string): FontFormat {
  const match = FONT_EXTENSION.exec(getFontFileName(url))
  if (!match) return 'unknown'
  const ext = match[1].toLowerCase()
  if (ext === 'eot') return 'unknown'
  return ext as Exclude<FontFormat, 'unknown'>
}

/**
 * 把字体 URL 解析成 CSS font-family 名称。
 *
 * 规则：取 URL 路径最后一段 → 去掉扩展名 → 转成安全的 CSS 标识符。
 * 也就是说字体名完全由 URL 决定，不依赖字体文件内部的 name table，
 * 同一个 URL 在任何环境、任何时候推导结果都一致。
 *
 * @example
 * deriveFontFamily('https://cdn.x.com/fonts/Alibaba PuHuiTi-Bold.ttf?v=3') // 'Alibaba-PuHuiTi-Bold'
 * deriveFontFamily('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2') // 'KFOmCnqEu92Fr1Mu4mxK'
 * deriveFontFamily('/fonts/思源黑体.otf') // '思源黑体'
 */
export function deriveFontFamily(url: string): string {
  const stem = getFontFileName(url).replace(FONT_EXTENSION, '').trim()
  if (!stem) return 'RemoteFont'

  const safe = stem
    // 保留字母、数字、下划线、连字符与 CJK，其余统一折叠成一个连字符
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!safe) return 'RemoteFont'
  // CSS 标识符不能直接以数字开头
  return /^\d/.test(safe) ? `font-${safe}` : safe
}

/** FNV-1a 32 位，用于同名 URL 冲突时生成稳定的短后缀 */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7)
}
