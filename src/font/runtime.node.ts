import { rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerFont } from 'canvas'
import type { FontURLDescriptor } from './types.ts'

/** 已经注册过的 family，避免重复下载 / 落盘 */
const registered = new Set<string>()
const tempDirs: string[] = []

// node-canvas 是延迟读取字体文件的，进程退出前不能删临时文件
process.once('exit', () => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 清理失败不影响退出
    }
  }
})

/**
 * node 端注册：node-canvas 只能从文件路径读字体，
 * 所以先 fetch 到字节、写临时文件、再 registerFont。
 * 临时文件在进程退出时统一删除（registerFont 是懒加载，提前删会让字体回退）。
 * 由 package.json 的 imports.#font-runtime 在 node 运行时选中。
 */
export async function loadFontRuntime(descriptor: FontURLDescriptor, family: string): Promise<void> {
  if (registered.has(family)) return

  const response = await fetch(descriptor.url)
  if (!response.ok) throw new Error(`[font] 下载字体失败 ${descriptor.url}：HTTP ${response.status}`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength) throw new Error(`[font] 字体内容为空 ${descriptor.url}`)

  const dir = await mkdtemp(join(tmpdir(), 'fabric-font-'))
  const file = join(dir, descriptor.fileName || 'font.ttf')
  await writeFile(file, bytes)
  tempDirs.push(dir)
  registerFont(file, { family })
  registered.add(family)
}