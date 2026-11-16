/**
 * fabric 事件表的全局增强。
 *
 * `ObjectEvents` 在 fabric 里是 interface，这里把 FontText 的自定义事件补进去，
 * 这样 `this.fire('font:loaded', ...)` 和 `text.on('font:loaded', (e) => e.family)`
 * 都有类型，不需要在每个调用点 cast。
 *
 * 顶层 `export {}` 是为了让本文件成为模块 —— 只有模块里的 `declare module`
 * 才是「增强」，否则会变成覆盖 fabric 的 ambient 声明。
 */
export {}

declare module 'fabric' {
  interface ObjectEvents {
    /** 字体加载完成（FontText） */
    'font:loaded': { name: string; url: string }
  }
}

declare module 'fabric/node' {
  interface ObjectEvents {
    /** 字体加载完成（FontText） */
    'font:loaded': { name: string; url: string }
  }
}
