# fabric-core

基于 **Vite 8 + Vue 3.5 + TypeScript + fabric.js 7** 的画布应用脚手架。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`（Vite 8 要求）
- npm 10+

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发，默认 http://localhost:5173 |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览生产构建产物 |
| `npm run typecheck` | 仅做 `vue-tsc` 类型检查 |
| `npm run demo:font:node` | node 端在线字体端到端演示，输出 `dist/node-font-demo.png` |

## 目录结构

```
├── index.html
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # 项目引用入口
├── tsconfig.app.json       # 应用代码（src）编译配置
├── tsconfig.node.json      # 构建脚本（vite.config.ts）编译配置
└── src/
    ├── main.ts
    ├── App.vue
    ├── style.css
    ├── vite-env.d.ts
    ├── opentype.d.ts           # opentype.js 的最小类型声明
    ├── fonts/                  # 在线字体能力（见下方专门章节）
    │   ├── index.ts            # 浏览器入口：注入 fabric（浏览器 bundle）
    │   ├── node.ts             # node 入口：注入 fabric/node
    │   ├── demo.node.ts        # 可运行的 node 端演示
    │   └── core/
    │       ├── Font.ts             # 单字体实体：URL → 名字/格式/CSS + fetch + opentype 解析
    │       ├── FontManager.ts      # 注册表：URL 去重、并发合并、订阅
    │       ├── layout.ts           # 排版内核：断行 / 字距 / 行距 / 对齐 / 字形路径
    │       ├── opentype.ts         # opentype 类型收窄与取字形封装
    │       ├── createFontText.ts   # FontText 工厂：单对象 + 多字形渲染
    │       └── types.ts
    └── components/
        └── FabricEditor.vue   # 画布编辑器示例
```

## fabric.js 7 迁移要点

fabric 7 是纯 ESM 包，内置类型声明，API 与 v5 差异较大：

```ts
// v5
import { fabric } from 'fabric'
const rect = new fabric.Rect({ ... })

// v6 / v7
import { Canvas, Rect, IText, Shadow } from 'fabric'
const rect = new Rect({ ... })
```

常见的几处坑：

- **命名导出**：`Canvas` / `Rect` / `Circle` / `IText` / `FabricText` / `FabricImage` / `Group` / `Shadow`。`fabric.Text`、`fabric.Image` 已分别改名 `FabricText`、`FabricImage`（旧名仍可用但标记 deprecated）。
- **`Shadow` 是类**：`shadow: new Shadow({ color, blur, offsetX, offsetY })`，不能再传字面量对象。
- **事件指针**：`mouse:wheel` 等事件不再提供 `opt.pointer`，改用 `canvas.getScenePoint(e)` / `canvas.getViewportPoint(e)`，返回值是 `Point` 实例。
- **图片加载**：用 `FabricImage.fromURL(url, { crossOrigin: 'anonymous' })`，返回 Promise。

## 示例功能

`src/components/FabricEditor.vue` 已实现一个最小可用的编辑器：

- 添加矩形 / 圆形 / 文本（自动级联偏移）
- 单选、Shift 多选、框选
- 层级调整（置顶 / 置底）
- `Delete` / `Backspace` 删除选中（文本编辑中不拦截）
- `Cmd/Ctrl + 滚轮` 以光标为中心缩放
- 导出场景 JSON、导出 PNG（2x）
- `ResizeObserver` 自适应容器尺寸，卸载时 `dispose()`

## 在线字体与 FontText

### 一句话概括

文字不再交给宿主字体系统去画，而是**用 opentype.js 把字形读成轮廓，自己排版、自己铺路径**。于是字体从「宿主资源」变成了「应用内数据」。

| | 交给宿主（`fillText` / `FontFace` / `registerFont`） | 自己画路径（现在） |
| --- | --- | --- |
| 加载副作用 | 全局注册，node 不可撤销 | 纯内存对象，无副作用 |
| 环境分支 | 浏览器 / node 两套加载逻辑 | **一套**：`fetch` → `parse` |
| 注册时序 | node 必须先注册再建画布 | 解析完即可排版 |
| CJK 缺字 | 空白，依赖系统 fallback | 缺字是 `.notdef`，行为可预期 |
| 样式自由度 | 一个字体只能一种死板样式 | 字距 / 行距 / 对齐 / 填充 / 描边 / 后续变形加粗都可控 |
| 平台一致性 | 两端字体栈不同，像素可能不同 | 同一条路径，两端结果一致 |

代价是**要自己量文字**。实测 opentype 的 advance + kerning 累加与 `ctx.measureText` 完全一致（误差 0.000），所以断行、对齐、行高只是加减法，不是精度问题。

### 避免「一个字一个对象」

这是本次改造的核心约束，做法是**结构上对齐 IText**：

```
IText                         FontText
─────────────────────────     ─────────────────────────
一个 FabricObject              一个 FabricObject
 text: string                  text: string
 _textLines: 每行文本           layout: 每行每字形的落点 + 路径命令
 _render → ctx.fillText        _render → 回放路径命令
```

整段文字始终是**一个** fabric 对象，`text` 仍是字符串。排版结果缓存成「每行每个字形的落点 + 该字形的路径命令」，`_render` 里一次遍历全部画完，**不会给每个字生成一个 Path 对象**（那样 100 个字就是 100 个对象，选框、层级、性能全部崩掉）。

与 IText 的差别只在「怎么画」：IText 把字符串交给 `ctx.fillText`，由宿主取字形；`FontText` 自己从 opentype 字形表取轮廓、按算好的位置回放成路径。

### 渲染细节

```ts
_render(ctx) {
  ctx.save()
  ctx.translate(-this.width / 2, -this.height / 2)   // 与 IText 的 _getLeftOffset() 约定一致
  ...
  ctx.restore()
}
```

几个关键点：

- **坐标约定**：进入 `_render` 时原点在对象中心（fabric 已经把 originX/originY 折算进变换矩阵），所以先平移半个宽高，之后所有落点都按「左上角为原点」的排版坐标直接画。这与 `Text._getLeftOffset() → -width / 2` 完全一致。
- **`objectCaching: true`**（默认开启）：整段文字被缓存到离屏画布，拖动 / 缩放 / 选中时不会重放几万条路径命令，只有 `dirty` 时才重画。
- **两种绘制模式**（`renderMode`）：
  - `merged`（默认）—— 所有字形合成一条路径、一次 `fill`，调用最少，绝大多数正体字体没问题；
  - `glyph` —— 每个字形 `beginPath` + 单独 `fill`，字形相交时不会被 nonzero 规则互相抵消（变量字体 / 手写体 / 后续做合成粗体时更稳）。
- **填充与描边**走 fabric 自己的 `_renderPaintInOrder`，所以 `fill` / `stroke` / `strokeWidth` / 渐变 / 阴影都是原生的，不需要自己实现。
- **尺寸同步**：`initDimensions()` 与 IText 同位，由排版结果反写 `width` / `height`，选框、缩放、对齐都按真实文字尺寸走。

### 三层职责

| 层 | 负责 |
| --- | --- |
| `Font`（一个 URL 一个实例） | 正则解析名字 / 格式 → CSS family 与 `@font-face`；`fetch` + `opentype.parse`；状态机 |
| `FontManager` | 注册表：URL 去重、并发合并、订阅、批量预加载、样式表输出 |
| `FontText`（工厂产物） | 持有文本与排版缓存，`_render` 铺字形路径；序列化 / 反序列化 |
| 入口 `index.ts` / `node.ts` | 只注入对应环境的 fabric bundle，其它全部共享 |

`FontManager` 现在只剩「全局字体加载器」这一个职责，因为**字体不再占用宿主的 family 命名空间**，撞名去重、注册时序、卸载这些约束全部消失了。

### URL 解析与 CSS 生成（`Font.parse()`）

名字和格式由**一条正则**一次匹配出来，并顺手转成 CSS：

```ts
const FONT_PATH_PATTERN = /^(?:.*[/\\])?([^/\\]+?)(?:\.(woff2|woff|ttf|otf|eot))?$/i
```

```ts
import { fontManager, FontManager } from './fonts'

const d = fontManager.parseFontURL('https://cdn.x.com/fonts/Alibaba PuHuiTi-Bold.ttf?v=3')
// {
//   url: 'https://cdn.x.com/fonts/Alibaba PuHuiTi-Bold.ttf?v=3',
//   fileName: 'Alibaba PuHuiTi-Bold.ttf',
//   name: 'Alibaba PuHuiTi-Bold',        // 主干名
//   family: 'Alibaba-PuHuiTi-Bold',      // 安全的 CSS font-family
//   extension: 'ttf',
//   format: 'ttf',
//   cssFormat: 'truetype',
//   src: 'url("...ttf?v=3") format("truetype")',
//   css: '@font-face { ... }',
// }

FontManager.parseURL(url)  // 静态纯解析，结果永远一致
fontManager.toCSS()        // 所有已加载字体拼成的 @font-face 样式表（降级到原生文字时用）
```

- 取路径最后一段去掉扩展名 → 转成安全 CSS 标识符；**query / hash 不参与命名，但保留在真实请求地址里**。
- `css` 只在使用「降级到原生 `@font-face`」时才需要，`FontText` 本身不依赖它。

| 扩展名 | `format` | CSS `format()` |
| --- | --- | --- |
| `.ttf` | `ttf` | `truetype` |
| `.otf` | `otf` | `opentype` |
| `.woff` | `woff` | `woff` |
| `.woff2` | `woff2` | `woff2` |
| `.eot` | `eot` | `embedded-opentype` |
| 其他 / 无扩展名 | `unknown` | 省略 |

> `deriveFontFamily` / `getFontFileName` / `getFontFormat` 仍从两个入口导出，但只是 `Font.parse()` 的兼容薄封装。

### 排版内核（`layout.ts`）

纯函数，不碰 canvas、不碰 DOM，浏览器与 node 完全共用：

```ts
layoutText(otFont, text, {
  fontSize,        // 字号
  maxWidth,        // 传了才换行，不传单行
  lineHeight,      // fontSize 的倍数，默认取 ascender - descender + lineGap
  letterSpacing,   // CSS letter-spacing 语义
  align,           // left | center | right | justify
  breakLongWords,  // 超宽单词是否按字符强制断开，默认 true
})
```

产出 `LayoutResult`：

- `lines[]` —— 每行的文本、真实宽度、基线位置、对齐偏移
- `glyphs[]` —— 每个字形的 `char / glyph / x / y / advance / charIndex / commands`
- `pathData` —— 整段合并后的 SVG path data（导出 / 调试 / 转曲用）
- `width / height / ascent / descent / lineHeight`

断行规则：空白、拉丁词整体、CJK 逐字。带行首禁则（`，。、；：？！）】」』`）与行尾禁则（`（【「『《〈`），超长单词按字符强制断。

### 用法

**浏览器**

```ts
import { Canvas } from 'fabric'
import { FontText, fontManager } from './fonts'

const canvas = new Canvas(el)

const text = new FontText('在线字体文本', {
  fontURL: 'https://cdn.example.com/fonts/Alibaba-PuHuiTi-Bold.ttf',
  fontSize: 36,
  wrapWidth: 400,          // 换行宽度；不传则单行
  lineHeight: 1.5,
  letterSpacing: 0,
  align: 'left',
  renderMode: 'merged',
  originX: 'left',
  originY: 'top',
  left: 40,
  top: 40,
})
canvas.add(text)

// 图层构造时自动申请字体；需要精确尺寸 / 截图时显式等待
await text.loadFont()
text.on('font:loaded', ({ family }) => console.log(family))
```

**node**

```ts
import { StaticCanvas } from 'fabric/node'
import { FontText, fontManager } from './src/fonts/node.ts'

const url = 'https://cdn.example.com/fonts/Alibaba-PuHuiTi-Bold.ttf'

// 先加载再建对象：拿到字形表才能算尺寸
await fontManager.load(url)

const text = new FontText('服务端渲染的文本', {
  fontURL: url,
  autoLoad: false,
  fontSize: 40,
  wrapWidth: 600,
  originX: 'left',
  originY: 'top',
  left: 40,
  top: 40,
})
await text.loadFont()

const canvas = new StaticCanvas(undefined, { width: 800, height: 200 })
canvas.add(text)
canvas.renderAll()
```

两端唯一的区别就是注入的 fabric bundle；加载、解析、排版、渲染全部同一条代码路径。

`npm run demo:font:node` 会本地起一个 HTTP 服务模拟「在线字体」，完整跑一遍 URL 推导 → 下载解析 → 注册表 → 排版 → 序列化往返 → PNG 输出，不依赖公网。可用 `FONT_FILE=/path/to/font.ttf` 指定字体文件。

### 与 IText 的差异（重要）

| | IText / Textbox | FontText |
| --- | --- | --- |
| 文字绘制 | `ctx.fillText`，宿主取字形 | 自己回放字形轮廓路径 |
| 编辑（光标 / 选区 / 双击选词 / IME） | 内建 | **没有**，当前是只读渲染层 |
| 文字选中 / 复制 / 搜索 | 原生 | 文字已变成矢量，需要另外铺透明文本层 |
| 复杂文字整形（阿拉伯文 / 印度语系连写） | 宿主 HarfBuzz | 无，仅适合中 / 英等不需要上下文连写的语言 |
| 变量字体 | 由 `font-weight` 选择实例 | 只有默认实例 |

`fontURL`、`text`、`fontSize`、`lineHeight`、`letterSpacing`、`align`、`wrapWidth`、`breakLongWords`、`renderMode` 都已进入 `customProperties` 与 `stateProperties`，所以 `toObject()` / `loadFromJSON()` / 撤销重做都能带走。

### 限制

1. **不支持 woff2**：opentype.js 用 `ttf / otf / woff`，woff2 需要 Brotli 解压 + transform 还原，它不做。`Font.load()` 会嗅探文件魔数并给出明确报错，请改用 ttf/otf/woff 或在服务端转码。
2. **大字体吃内存**：CJK 全集字体（如 Arial Unicode 22MB / 5 万字形）解析约 120ms、heap +135MB。多字体场景建议按需加载 + 及时 `unload()`。
3. **无编辑能力**：当前是渲染层，光标、选区、IME 组合输入都没做。
4. **字体需要可跨域访问**：`fetch` 受 CORS 约束，CDN 必须带 `Access-Control-Allow-Origin`。

### API

**FontText 实例**

| 成员 | 说明 |
| --- | --- |
| `fontURL` | 在线字体地址；改动后自动重新加载并重排 |
| `text` | 文本内容（字符串，与 IText 一致） |
| `fontSize` / `lineHeight` / `letterSpacing` / `align` / `wrapWidth` / `breakLongWords` | 排版参数，任一变化自动重排 |
| `renderMode` | `merged` / `glyph` |
| `fontStatus` | `unloaded` / `loading` / `loaded` / `error` |
| `loadFont()` | 等待字体就绪，多次调用共享同一个 Promise |
| `getLayout()` | 取排版结果（行、字形、pathData） |
| `toPathData()` | 整段文字合并后的 SVG path data，用于转曲 / 导出 SVG |
| `initDimensions()` | 由排版结果反写 `width` / `height`（与 IText 同位） |

**FontManager**

| 方法 | 说明 |
| --- | --- |
| `load(url)` | 加载，返回 `FontRecord`；同 URL 并发共享同一个 Promise，失败后可重试 |
| `preload(urls)` | 批量预加载 |
| `parseFontURL(url)` | 实例解析 → `FontURLDescriptor`（名字 / 格式 / CSS） |
| `FontManager.parseURL(url)` | 静态纯解析 |
| `toCSS({ onlyLoaded? })` | 注册表 → `@font-face` 样式表 |
| `resolveFamily(url)` | 同步得到 family |
| `get(url)` / `getFont(url)` | 查 `FontRecord` / 查 `Font` 实体 |
| `fonts` | 全部 `Font` 实体（实时引用） |
| `has(url)` / `isReady(url)` | 是否注册过 / 是否加载成功 |
| `list()` / `loaded` | 快照 / 仅成功项 |
| `subscribe(fn)` | 状态变化订阅，返回取消函数 |
| `unload(url)` / `clear()` | 释放字形表，下次使用会重新加载 |

**Font**

| 成员 | 说明 |
| --- | --- |
| `static parse(url)` | 正则解析 + CSS 生成 |
| `name` / `fileName` / `family` / `extension` / `format` / `cssFormat` | 解析产物 |
| `src` / `css` / `toCSS()` | CSS 片段 |
| `otFont` / `numGlyphs` | 解析后的字形表 / 字形数 |
| `load(options?)` | `fetch` → `opentype.parse`；并发共享 Promise |
| `status` / `error` / `isReady` / `detail` | 状态机与查询 |
| `toRecord()` / `dispose()` | 记录对象 / 释放字形表 |

记录状态机为 `loading → loaded | error`，字段包含 `url / family / format / loadedAt / error / detail`。

## 发布前检查

`npm run build` 会先跑 `vue-tsc -b`，类型不通过不会产出产物。
