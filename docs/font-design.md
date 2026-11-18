# 在线字体（Font / FontText）实现说明

> 代码位置：加载层 `src/font/`，图层 `src/libs/FontText.ts`。
> 本文档描述当前实现，用于后续修改前快速定位；渲染本身全部交给 fabric 的 `Textbox`，没有自研排版。

## 一、分层

```
src/font/          加载层：URL → @font-face → 按环境注册（不依赖 fabric / Vue）
src/libs/FontText  图层：Textbox + font={name,url}，就绪后交给 fabric 绘制
```

| 层 | 可以依赖 | 不该做 |
| --- | --- | --- |
| `src/font` | `fetch` / `FontFace` / `node:canvas`（通过 `#font-runtime` 注入） | 不 import Vue / fabric |
| `src/libs/FontText.ts` | `#fabric`、`src/font` | 不做字体文件解析、不碰 DOM 字体 API |

`FontText` 里直接 `import { classRegistry, Textbox } from '#fabric'`，浏览器 / node 的 bundle 由 **模块解析** 决定，代码里没有环境判断。

## 二、文件与职责

```
src/font/
├── types.ts              FontFormat / FontStatus / FontURLDescriptor
├── Font.ts               URL 解析（静态纯函数）+ 单字体加载与状态
├── FontManager.ts        name → Font 的注册表
├── manager.ts            进程级单例 fontManager
├── FontError.ts          统一错误类型（code / url / status / cause）
├── runtime.browser.ts    FontFace + document.fonts.add
├── runtime.node.ts       fetch → 临时文件 → canvas.registerFont
└── index.ts              对外导出
src/libs/FontText.ts      Textbox 子类 + classRegistry 注册
src/types/fabric-events.d.ts  给 ObjectEvents 补 'font:loaded'
```

## 三、环境分支：模块解析，不是运行时判断

`package.json` 的 `imports`：

```json
{
  "#fabric": { "node": "fabric/node", "default": "fabric" },
  "#font-runtime": { "node": "./src/font/runtime.node.ts", "default": "./src/font/runtime.browser.ts" }
}
```

- `Font.ts` 只 `import { loadFontRuntime } from '#font-runtime'`，不知道自己在浏览器还是 node。
- 两个入口（`src/libs/index.ts`、`src/libs/node.ts`）导出同一份源码，差异只在打包 / 解析阶段。
- ⚠️ `fabric` 与 `fabric/node` 的 `classRegistry` 是两份，同一进程里不要混用两个入口。

## 四、URL 解析：Font.parse()

```ts
Font.parse(url: string, familyOverride?: string): FontURLDescriptor
```

纯函数，无状态、无 IO。步骤：

1. `url.trim()`，`decodeFontPath()` 先按 `[?#]` 切掉 query / hash 再 `decodeURIComponent`（`?redirect=/a/b` 不会干扰扩展名匹配）。
2. 正则：`/^(?:.*[/\\])?([^/\\]+?)(?:\.(woff2|woff|ttf|otf|eot))?$/i`
   - 组 1 = 文件名主干（`name`）
   - 组 2 = 扩展名（`extension`）
3. `CSS_FORMAT_TOKENS`：`ttf→truetype`、`otf→opentype`、`woff`、`woff2`、`eot→embedded-opentype`。
4. `family`：传了 `familyOverride` 就直接用（`FontManager` 会传 `name`），否则由 `toCssFamily(name)` 生成。
5. 生成 `src` 与完整 `css`（`font-display: swap`）。

`toCssFamily`：非 `\p{L}\p{N}_-` 折叠成 `-`，压缩连续 `-`、去首尾；空串回退 `RemoteFont`；以数字开头则加 `font-` 前缀。

`cssString`：转义反斜杠、双引号，`\r?\n` 转成 `"\A "`。

`descriptor` 字段：

| 字段 | 说明 |
| --- | --- |
| `url` | trim 后的原始地址（保留 query / hash，请求要用） |
| `fileName` | 路径最后一段，带扩展名 |
| `name` | 去扩展名的主干名（未做 CSS 安全化） |
| `family` | `familyOverride` 或安全化后的 font-family |
| `extension` / `format` / `cssFormat` | 扩展名与归一化格式；无法识别时 `format = 'unknown'` |
| `src` | `url("...") format("truetype")` |
| `css` | 完整 `@font-face` 规则，服务端渲染可直接用 |

## 五、Font：单字体实体与状态机

字段只有两个：

```ts
private task: Promise<void> | null = null   // 进行中的加载
private _loaded = false                     // 是否注册成功
```

`status` 是**推导值**，不单独存储：

```ts
if (this._loaded) return 'loaded'   // 已注册
return this.task ? 'loading' : 'error'  // 注意：从未加载过也是 'error'
```

`load()` 语义：

```ts
load() {
  if (this._loaded) return Promise.resolve()
  this.task ??= this.run()   // 并发共享同一次加载
  return this.task
}
```

`run()`：

1. `await to(loadFontRuntime(descriptor, this.family))`（`await-to-js`，避免 try/catch）。
2. **先** `this.task = null`，**后**判断错误：
   - 失败 → `throw new FontError('load', url, ..., { cause })`；因为 task 已清空，下一次 `load()` 就是重试。
   - 成功 → `this._loaded = true`。
3. `dispose()` 只重置 `_loaded / task`；字体已经注册进 `document.fonts`（或 node-canvas）里，无法反注册，
   所以 `dispose` 后重新 `load()` 会再走一次注册流程。

## 六、FontManager：注册表

```ts
class FontManager {
  private readonly fonts = new Map<string, Font>()
  get({ url, name }): Promise<Font>
  peek(name) / has(name)
  delete(name) / clear()
  get size
}
```

- key 是 `name`（trim 后，空则抛错）。
- `get`：`const font = map.get(key) ?? create(key, url)`，然后 `await font.load()`，返回实体。
- `create`：`Font.parse(url, name)` —— **family 就是 name 本身**，保证 `fontFamily === font.name`，
  这样图层只需要记住 `{ name, url }`。
- 失败时实体留在表里（`task=null`），再次 `get` 即重试，不需要手动删除。
- `delete / clear` 调 `font.dispose()` 并移除登记，下次 `get` 重新解析 + 注册。
- ⚠️ **同一个 name 配不同 url 会直接复用第一个实体**，`url` 参数不会更新已有实体。需要换源时必须先 `delete(name)`。

`src/font/manager.ts` 导出进程级单例 `fontManager`，页面里所有 FontText 共享同一份字体表。

## 七、运行时注册

### 浏览器 `runtime.browser.ts`

```ts
const face = new FontFace(family, descriptor.src, { display: 'swap' })
await face.load()
document.fonts.add(face)
```

- `descriptor.src` 是 CSS `src` 值，含 `format()`。
- 没有 `FontFace` / `document` 时抛错，由 `Font` 包装成 `FontError('load')`（注意 `code` 目前只有 `'unsupported'` 与 `'load'` 两个值，
  browser 分支实际不会抛 `'unsupported'`，需要时可在 runtime 里改）。
- 字体必须可跨域：CDN 要带 `Access-Control-Allow-Origin`。

### node `runtime.node.ts`

node-canvas 只能从文件路径读字体，所以：

```
fetch(url) → 检查 ok / 非空 → mkdtemp → writeFile(fileName || 'font.ttf')
→ registerFont(file, { family }) → registered.add(family)
```

- `registered` 是模块级 `Set<family>`，重复注册直接返回。
- 临时目录推进 `tempDirs`，`process.once('exit')` 统一 `rmSync`；
  **不能在注册后立刻删**，node-canvas 是懒读取。
- `canvas` 是 optionalDependency，没装时这个模块会加载失败。

## 八、FontText 图层

```ts
class FontText extends Textbox {
  static type = 'FontText'
  static customProperties = [...Textbox.customProperties, 'font']
}
```

### 状态字段

```ts
_font: FontSource | null        // { name, url }
_fontStatus: 'unloaded' | 'loading' | 'loaded' | 'error'
_autoWidth: boolean             // 构造时没传 width → true
_task: Promise<void> | null     // 进行中的加载
```

### 构造

```ts
constructor(text, { font, autoLoad = true, ...rest }) {
  super(text, { splitByGrapheme: true, ...rest })
  this._autoWidth = rest.width === undefined
  if (this._autoWidth) this.on('changed', () => { if (!this.isEditing) this.fitToContent() })
  if (font) { this._font = normalizeFont(font); if (autoLoad) void this.loadFont().catch(() => undefined) }
}
```

- `splitByGrapheme: true` 是默认值：CJK 没有空格，不按字断行会把整段当成一个词把宽度撑开。
  `rest` 在后面展开，显式传 `splitByGrapheme: false` 可以覆盖。
- `autoLoad: false` 时不会自动加载，需要手动 `await loadFont()`（node demo 就是这种用法）。

### font 访问器

```ts
get font(): FontSource | null
set font(value) {
  const next = value ? normalizeFont(value) : null
  if (next?.name === this._font?.name && next?.url === this._font?.url) return
  this._font = next
  this._fontStatus = 'unloaded'
  if (next) void this.loadFont().catch(() => undefined)
  else { this.set('fontFamily', ''); this.initDimensions(); this.dirty = true; this.canvas?.requestRenderAll() }
}
```

- 相同 name+url 幂等返回。
- 清空字体时只清 `fontFamily` 并重算尺寸，不会卸载已注册的字体。

### loadFont()

```ts
loadFont(): Promise<void> {
  if (!font) return reject
  if (status === 'loaded') return resolve
  if (this._task) return this._task          // 并发共享
  this._fontStatus = 'loading'
  this._task = (async () => {
    try {
      await fontManager.get({ url: font.url, name: font.name })
      if (this._font !== font) return         // 期间换了字体，丢弃结果
      this.set('fontFamily', font.name)       // 必须赋值，才能让 fabric 丢掉测量缓存
      this._fontStatus = 'loaded'
      this.initDimensions()
      if (this._autoWidth) this.fitToContent()
      this.dirty = true
      this.canvas?.requestRenderAll()
      this.fire('font:loaded', font)
    } catch (error) {
      if (this._font === font) this._fontStatus = 'error'
      throw error
    } finally {
      this._task = null                       // 失败后可直接重试
    }
  })()
  ...
}
```

要点：

1. **顺序不能颠倒**：先等注册完成，再改 `fontFamily`。fabric 靠属性变化清测量缓存，
   提前赋值会按「系统未安装字体」的尺寸测一遍并缓存。
2. `this._font !== font` 是比较对象引用（`font` setter 每次都会新建对象），用于丢弃过期加载。
3. 失败时只有 `this._font === font` 才把状态改成 `'error'`；task 在 `finally` 里清空，重试直接再调 `loadFont()`。
4. 成功后 fire `'font:loaded'`，payload 是 `FontSource`（类型来自 `src/types/fabric-events.d.ts` 的模块增强）。

### 自动宽度 fitToContent()

```ts
this.width = 1e6; this.initDimensions()
content = max(getLineWidth(i) for each line)
this.width = Math.max(1, Math.ceil(content) + 1)   // +1px 防浮点误差多折一行
this.initDimensions()
```

- 只在 `_autoWidth` 时生效；显式传了 `width` 就是固定宽度排版。
- 由 `changed` 事件触发（文本改 / 字体度量改），编辑中不调整（避免光标跳动）。

## 九、时序

```
new FontText(text, { font })
        │
        ├─ super(text, { splitByGrapheme: true, ... })
        ├─ _autoWidth 判断 + 绑定 changed
        └─ loadFont()（autoLoad 默认 true）
                 │
                 ▼
      fontManager.get({ url, name })
                 │  name 已登记 → 复用
                 │  未登记 → new Font(Font.parse(url, name)) → load()
                 ▼
        loadFontRuntime(descriptor, family)
                 │  browser: FontFace.load() → document.fonts.add()
                 │  node:    fetch → 临时文件 → registerFont()
                 ▼
      set('fontFamily', name) → initDimensions() → fitToContent()
                 ▼
      dirty / requestRenderAll / fire('font:loaded')
```

## 十、序列化

- `static customProperties = [...Textbox.customProperties, 'font']`，`font` 直接以 `{ name, url }` 进 JSON。
- `classRegistry.setClass(FontText)`（在 `FontText.ts` 文件末尾）。
- `src/main.ts` 有一行副作用导入 `import './libs/index.ts'`，确保浏览器端注册发生在任何反序列化之前。
- `src/libs/node.ts` 是 node 入口，注册的是 `fabric/node` 那份 classRegistry。

## 十一、必须遵守的不变量

1. 加载层（`src/font`）不要 import fabric / Vue，否则环境注入和可测试性都会被破坏。
2. 环境差异只能通过 `#font-runtime` / `#fabric` 的模块解析解决，不要在业务里写 `typeof window`。
3. `family` 必须等于 `font.name`：`FontManager` 用 name 作为 `familyOverride`，两边不一致会导致改 `fontFamily` 时找不到已注册字体。
4. 先注册、后设 `fontFamily`，否则 fabric 会缓存错误的度量。
5. `Textbox.width` 不能为 0；`fitToContent` 至少写 1。
6. 字体文件必须可跨域；node 端临时字体文件不能在注册后立刻删除。
7. 同名不同 URL 会复用旧实体，需要换源时先 `fontManager.delete(name)`。

## 十二、业务接入（demo 现状）

| 位置 | 改动 |
| --- | --- |
| `src/main.ts` | 副作用导入 `./libs/index.ts`，完成 `classRegistry` 注册 |
| `src/composables/useEditorActions.ts` | `addFontText()`：`new FontText(..., { font: { ...FONT } })`，再 `loadFont()` 并提示成功 / 失败 |
| `src/config/property_form.ts` | 「在线字体」section：只读展示 `font.name` 与 `font.url` |
| `src/libs/index.ts` | 导出 `FontText` 与 `fontManager / Font / FontError / FontManager` |
| `src/libs/node.ts` | `export * from './index.ts'`，node 程序从 `libs/node.ts` 引入 |
| `src/demo/font.node.ts` | 端到端脚本：本地 HTTP 提供字体 → 解析 → 加载 → 排版 → 序列化 → 反序列化 → 输出 PNG |

`FONT` 常量在 `useEditorActions.ts`：

```ts
const FONT = {
  name: 'Noto Sans SC',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-chinese-simplified-400-normal.woff',
}
```

## 十三、常见修改指引

| 想改什么 | 改哪里 |
| --- | --- |
| 支持的字体格式 / 扩展名 | `Font.FONT_PATH_PATTERN` + `CSS_FORMAT_TOKENS` + `types.FontFormat` |
| 字体名 → CSS family 的规则 | `Font.toCssFamily` |
| `@font-face` 内容（加 `font-weight` / `unicode-range`） | `Font.parse` 里拼 `css` 的数组 |
| 浏览器注册方式 | `runtime.browser.ts` |
| node 下载 / 落盘 / 清理 | `runtime.node.ts` |
| 缓存策略（key、复用、重试） | `FontManager` |
| 图层加载状态与事件 | `FontText.loadFont` / `font` 访问器 |
| 自动宽度规则 | `FontText.fitToContent` |
| 给 FontText 加新可序列化字段 | `static customProperties` + 构造函数解构（参照 ImageLayer 的剥离写法） |

## 十四、已知限制

- `Font.status` 在从未加载过时也是 `'error'`（只有 `FontText` 区分 `unloaded`）。需要更精确的状态时改 `Font.status` 的推导。
- `dispose()` 无法真正注销已注册的字体，只重置实体状态。
- 大体积 CJK 字体占用较高；多字体场景建议 `fontManager.delete(name)` 手动释放。
- node 端依赖可选包 `canvas`，未安装时 `registerFont` 不可用，会回退默认字体（且 `runtime.node.ts` 会在 import 阶段报错，需要按需加载）。
- 没有字体子集化 / unicode-range 拆分，全部字符走同一份字体文件。