import type { FontRuntime } from './core/types.ts'

interface NodeLikeGlobal {
  process?: { versions?: { node?: string } }
}

/**
 * 判断当前运行环境。
 * 优先判断 node：fabric/node 内部用了 jsdom，如果只看 document 会误判成浏览器。
 */
export function detectRuntime(): FontRuntime {
  const nodeVersion = (globalThis as NodeLikeGlobal).process?.versions?.node
  if (nodeVersion) return 'node'

  if (
    typeof document !== 'undefined' &&
    typeof document.fonts !== 'undefined' &&
    typeof FontFace !== 'undefined'
  ) {
    return 'browser'
  }

  throw new Error('[font] 无法识别运行环境：既不是 Node，也没有可用的 FontFace API')
}

export function assertRuntime(expected: FontRuntime): void {
  const actual = detectRuntime()
  if (actual !== expected) {
    throw new Error(
      `[font] 导入了 ${expected} 端入口，但当前运行在 ${actual} 端。` +
        (expected === 'node'
          ? '浏览器端请从 ./fonts 导入。'
          : 'node 端请从 ./fonts/node.ts 导入。'),
    )
  }
}
