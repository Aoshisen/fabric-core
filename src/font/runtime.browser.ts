import type { FontURLDescriptor } from './types.ts'

/**
 * 浏览器端注册：FontFace.load() → document.fonts.add()。
 * 由 package.json 的 imports.#font-runtime 在打包时选中。
 */
export async function loadFontRuntime(descriptor: FontURLDescriptor, family: string): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    throw new Error('[font] 当前环境没有 FontFace')
  }
  const face = new FontFace(family, descriptor.src, { display: 'swap' })
  await face.load()
  document.fonts.add(face)
}