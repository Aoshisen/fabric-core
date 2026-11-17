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
    ├── types/
    │   └── fabric-events.d.ts      # 给 fabric ObjectEvents 补 FontText 的自定义事件
    ├── font/                   # 字体加载层（不依赖 fabric）
    │   ├── Font.ts             # 单字体实体：URL → 名字/格式/CSS + 运行时注册字体
    │   ├── FontError.ts        # 加载失败的唯一错误类型
    │   ├── FontManager.ts      # 按 { url, name } 取字体
    │   ├── manager.ts          # 进程级单例 fontManager
    │   ├── runtime.browser.ts  # FontFace 注册（#font-runtime 的 default）
    │   ├── runtime.node.ts     # registerFont 注册（#font-runtime 的 node）
    │   ├── types.ts
    │   └── index.ts
    ├── libs/                   # 可复用组件
    │   ├── FontText.ts         # 文字图层：Textbox + font={name,url} 自动注册字体
    │   ├── index.ts            # 浏览器入口：re-export FontText + 加载层
    │   └── node.ts             # node 入口：re-export index（fabric/node 由 #fabric 映射）
    ├── demo/
    │   └── font.node.ts        # 可运行的 node 端演示
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

`FontText` 就是 fabric 的 `Textbox`，额外接一个 `font = { name, url }`：构造时交给加载层注册字体（浏览器 `FontFace` + `document.fonts.add()`，node `canvas.registerFont`），就绪后再渲染。

换行、对齐、字距、光标、选区、IME、双击选词、缩放、序列化全部是 fabric 原生行为 —— 我们不再自己排版，也不再自己画字形。

```ts
const text = new FontText('在线字体文本', {
  font: {
    name: 'Alibaba-PuHuiTi-Bold',   // CSS font-family + 加载层缓存 key
    url: 'https://cdn.example.com/fonts/Alibaba-PuHuiTi-Bold.ttf',
  },
  width: 400,          // Textbox 的换行宽度；不传则按内容自适应
  fontSize: 36,
  lineHeight: 1.16,
  textAlign: 'left',
  fill: '#1b2027',
})
canvas.add(text)
await text.loadFont()   // 可省略：构造时自动加载，加载完会重排
```

### 两层结构

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 加载层 | `src/font` | URL → 名字 / 格式 / `@font-face`，再按环境注册（`#font-runtime`：浏览器 `FontFace`、node `registerFont`）；错误分类 + 进程级单例，不依赖 fabric |
| 图层 | `src/libs` | `FontText` = `Textbox` + `font` → 注册字体；浏览器 / node 入口 |

加载层的 `Font.parse()` 负责 URL → 名字 / 格式 / `@font-face` 规则，`FontText` 注入样式时用它；`FontManager` 提供跨模块共享的字体缓存。

### 字体管理器

```ts
const font = await fontManager.get({ url, name: 'Alibaba-PuHuiTi-Bold' })
font.status   // loading / loaded / error
font.toCSS()  // 单个字体的 @font-face
```

`name` 既是缓存 key，也是 CSS family：同 name 复用实体，同 URL 合并加载；失败 reject `FontError`，再调一次就是重试。

### node 端

node 端同样是 `new FontText(...)` + `loadFont()`，不用手动注册：

```ts
const text = new FontText('服务端渲染的文本', { font: { name, url }, fontSize: 40, width: 600 })
await text.loadFont()
```

`src/font/runtime.node.ts` 会 fetch 字体字节 → 写临时文件 → `canvas.registerFont()`，临时文件在进程退出时统一清理（node-canvas 是懒读取，不能提前删）。
环境分支由 `package.json` 的 `imports.#font-runtime` 在解析阶段决定，业务代码里没有 `if (node)`。

### 与 Textbox 的差异

| | Textbox | FontText |
| --- | --- | --- |
| 字体来源 | `fontFamily` 名字，宿主必须装过 | `font = { name, url }`，自动注册，不需要安装 |
| 其它行为 | — | 完全继承 |

### 限制

1. **字体需可跨域**：`FontFace` 走浏览器字体加载，CDN 必须带 `Access-Control-Allow-Origin`。
2. **大字体吃内存**：CJK 全集字体渲染占用较高，多字体场景建议按需 `fontManager.delete(name)`。
3. **node 端依赖可选包 `canvas`**：没装 `canvas` 时 `registerFont` 不可用，会退回默认字体渲染。

### API

**FontText**

| 成员 | 说明 |
| --- | --- |
| `font` | `{ name, url }`；赋值会同时切换 `fontFamily` 与地址并重新加载，置 `null` 则清空 |
| `fontStatus` | `unloaded` / `loading` / `loaded` / `error` |
| `loadFont()` | 等字体就绪，多次调用共享同一次加载 |
| 其余 | 全部继承 fabric `Textbox`：`width` / `textAlign` / `charSpacing` / `editable` / `enterEditing()` / `exitEditing()` … |

选项只有 `font` / `autoLoad`，其余参数（`width` / `textAlign` / `charSpacing` / `lineHeight` …）都是 Textbox 原生字段，不做二次映射。不传 `width` 时按内容自适应单行宽度。

运行中换字体：

```ts
text.font = { name: 'Source-Han-Sans', url: 'https://cdn.example.com/SourceHanSans.ttf' }
```

`font` 会进序列化（`toObject()` 里是 `{ name, url }`），`loadFromJSON` / 撤销重做都能还原。
**FontManager**

| 方法 | 说明 |
| --- | --- |
| `get({ url, name })` | 取字体，返回 `Promise<Font>`；没加载过就现建并加载，失败 reject `FontError`，再调即重试 |
| `peek(name)` / `has(name)` | 查已登记的实体（不触发加载） / 是否登记过 |
| `delete(name)` / `clear()` | 释放字形表并移除登记 / 清空 |
| `size` | 已登记字体数 |

**Font**

| 成员 | 说明 |
| --- | --- |
| `static parse(url, family?)` | 正则解析 + CSS 生成 |
| `name` / `fileName` / `family` / `extension` / `format` / `cssFormat` | 解析产物 |
| `src` / `css` / `toCSS()` | CSS 片段 |
| `load()` | 按环境注册字体（浏览器 `FontFace`、node `registerFont`）；并发共享 Promise，失败后调用即重试 |
| `status` / `isReady` / `isPending` | 状态推导（不单独存储） |
| `dispose()` | 释放字形表 |

失败原因不在状态里，`load()` reject 的就是 `FontError`：

| `code` | 含义 |
| --- | --- |
| `load` | 注册失败（网络 / CORS / 文件损坏 / 环境不支持），`cause` 保留原始错误 |
## 发布前检查

`npm run build` 会先跑 `vue-tsc -b`，类型不通过不会产出产物。