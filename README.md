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
    ├── fonts/                  # 在线字体能力（见下方专门章节）
    │   ├── index.ts            # 浏览器入口：fabric + FontFace 驱动
    │   ├── node.ts             # node 入口：fabric/node + node-canvas 驱动
    │   ├── env.ts              # 运行环境判定
    │   ├── demo.node.ts        # 可运行的 node 端演示
    │   ├── core/               # 环境无关内核（名字推导 / Manager / TextBox 工厂）
    │   └── drivers/            # browser.ts / node.ts 两套加载逻辑
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
- `ResizeObserver` 自适应容器尺寸，卸载时 `dispose()` 释放
  
## 在线字体 TextBox 与 FontManager

自定义图层 `FontTextBox` 继承 fabric 7 的 `Textbox`，**唯一区别**是接收一个在线字体 URL（`fontURL`）。字体的 `fontFamily` 完全由这个 URL 推导，不允许手填；所有加载过的字体集中放在 `fontManager` 里。

### 设计要点

| 事项 | 浏览器 | node |
| --- | --- | --- |
| 入口 | `src/fonts/index.ts` | `src/fonts/node.ts` |
| fabric bundle | `fabric` | `fabric/node` |
| 加载方式 | `new FontFace(family, url(...))` → `document.fonts.add()` | `fetch` → 落盘到临时目录 → `canvas.registerFont(path, { family })` |
| 支持格式 | ttf / otf / woff / woff2 | 仅 ttf / otf |
| 撤销注册 | `document.fonts.delete(face)` | 不支持，注册是进程级的 |

> **为什么是两个入口**：fabric 7 的 `fabric` 与 `fabric/node` 是两份独立 bundle，`classRegistry` 各一份。`FontTextBox` 必须用「当前环境那一套」Textbox 作基类并注册到同一套 registry，否则 `enlivenObjects` / `loadFromJSON` 反序列化会找不到类。共享逻辑放在 `core/`，通过工厂注入 `fabric api + FontManager`，两端只负责注入不同的实现。

### URL → 字体名规则

取 URL 路径最后一段，去掉扩展名，转成安全的 CSS 标识符；query / hash 不参与。同一个 URL 在任何环境、任何时刻结果都一致：

```ts
deriveFontFamily('https://cdn.x.com/fonts/Alibaba PuHuiTi-Bold.ttf?v=3') // 'Alibaba-PuHuiTi-Bold'
deriveFontFamily('https://cdn.x.com/fonts/思源黑体.otf')                  // '思源黑体'
deriveFontFamily('/fonts/KFOmCnqEu92Fr1Mu4mxK.woff2')                    // 'KFOmCnqEu92Fr1Mu4mxK'
```

不读字体文件内部的 name table —— FontFace / registerFont 注册时用的就是这个名字，所以渲染结果和名字天然一致。不同 URL 撞名时 `FontManager` 会给后者追加一个基于 URL 的稳定短哈希后缀。

### 浏览器用法

```ts
import { Canvas } from 'fabric'
import { FontTextBox, fontManager } from './fonts'

const canvas = new Canvas(el)

// 图层自己会申请字体；加载完成前用系统字体占位，完成后自动重排 + 重绘
const box = new FontTextBox('在线字体文本', {
  fontURL: 'https://cdn.example.com/fonts/Alibaba-PuHuiTi-Bold.ttf',
  left: 40,
  top: 40,
  width: 400,
  fontSize: 36,
})
canvas.add(box)

await box.loadFont()                       // 需要精确测量 / 截图时显式等待
box.on('font:loaded', ({ family }) => console.log(family))

fontManager.list()                         // 所有已加载 / 加载中 / 失败的字体
fontManager.isReady(url)                   // boolean
const unsubscribe = fontManager.subscribe((records) => renderFontPanel(records))
await fontManager.preload([url1, url2])    // 批量预加载
```

`fontURL` 已进入 `customProperties` 与 `stateProperties`，因此 `toObject()` / `loadFromJSON()` / 撤销重做都能带走它。`main.ts` 里已做副作用导入，保证类被注册。

> 在线字体必须带 CORS 响应头（`Access-Control-Allow-Origin`），否则浏览器字体加载会被拒绝。

### node 用法

```ts
import { StaticCanvas } from 'fabric/node'
import { FontTextBox, fontManager } from './src/fonts/node.ts'

const url = 'https://cdn.example.com/fonts/Alibaba-PuHuiTi-Bold.ttf'

// ⚠️ node-canvas 要求先注册字体，再创建画布 / 文本对象
await fontManager.load(url)

const box = new FontTextBox('服务端渲染的文本', {
  fontURL: url,
  autoLoad: false,
  width: 600,
  fontSize: 40,
})
await box.loadFont()

const canvas = new StaticCanvas(undefined, { width: 800, height: 200 })
canvas.add(box)
canvas.renderAll()
```

node 端的两个硬限制：

1. **只支持 ttf / otf**：node-canvas 用 FreeType，`woff` / `woff2` 会直接报错（驱动会嗅探文件魔数，即使 URL 没有扩展名也能识别）。需要 woff2 时先转成 ttf。
2. **注册必须在创建 canvas 之前、且进程级不可撤销**：`FontManager.unload()` 在 node 端只能清理记录，不会真的注销字体。

`npm run demo:font:node` 会本地起一个 HTTP 服务模拟「在线字体」，完整跑一遍 URL 推导 → 下载注册 → 注册表 → 序列化往返 → PNG 输出，不依赖公网。可用 `FONT_FILE=/path/to/font.ttf` 指定字体文件。

### FontManager API

| 方法 | 说明 |
| --- | --- |
| `load(url)` | 加载，返回 `FontRecord`；同 URL 并发共享同一个 Promise，失败后可重试 |
| `preload(urls)` | 批量预加载 |
| `resolveFamily(url)` | 同步得到最终 family，构造图层时用得上 |
| `get(url)` / `getByFamily(name)` | 查记录 |
| `has(url)` / `isReady(url)` | 是否注册过 / 是否加载成功 |
| `list()` / `loaded` | 快照 / 仅成功项 |
| `subscribe(fn)` | 状态变化订阅，返回取消函数 |
| `unload(url)` / `clear()` | 释放（node 端仅清理记录） |
| `useDriver(driver)` | 运行时替换驱动 |

记录状态机为 `loading → loaded | error`，字段包含 `url / family / format / runtime / loadedAt / error / detail`。

## 发布前检查

`npm run build` 会先跑 `vue-tsc -b`，类型不通过不会产出产物。
