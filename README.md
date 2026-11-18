# fabric-core

基于 **Vite 8 + Vue 3.5 + TypeScript + fabric.js 7** 的画布应用脚手架。

它把 fabric 的通用能力沉淀成可直接复用的图层类，再用一个最小编辑器来演示和验证这些能力：

- `FontText`：`Textbox` + `font={ name, url }`，自动注册在线字体，换行 / 字距 / 对齐 / IME 全部走 fabric 原生行为
- `ImageLayer`：图片图层，支持 contain / fill、去白底、单色滤镜、内 / 外描边、蒙版遮罩
- 编辑器：基础图形、文本、图片上传、层级调整、属性面板、JSON / PNG 预览、侧栏拖拽与快捷键

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 分层与依赖、运行时拓扑、三条数据流、配置驱动、构建环境、扩展指南 |
| [docs/font-design.md](docs/font-design.md) | 字体加载层（URL 解析 / 浏览器 FontFace / node registerFont）、FontText 实现细节 |
| [docs/image-layer-design.md](docs/image-layer-design.md) | ImageLayer 处理管线、能力 mixin、描边 / 蒙版 / 滤镜实现细节 |

## 快速开始

环境要求：Node `^20.19.0 || >=22.12.0`，npm 10+。

```bash
npm install
npm run dev        # http://localhost:5173
```

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发 |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | 仅做 `vue-tsc` 类型检查 |
| `npm run demo:font:node` | node 端在线字体端到端演示，输出 `dist/node-font-demo.png` |
| `npm run demo:image:node` | node 端 ImageLayer 端到端演示（构图 / 滤镜 / 描边 / 蒙版），输出 `dist/node-image-layer-demo.png` |

## 目录速览

```
src/
├── font/          # 字体加载层：URL → @font-face → 按环境注册
├── libs/          # 可复用图层：FontText、image/（ImageLayer + mixin）
├── config/        # 声明式配置：侧栏按钮、属性表单 schema
├── composables/   # 编辑器命令、属性双向绑定、预览、侧栏拖拽
├── components/    # 三栏编辑器 UI
├── types/         # fabric 模块增强（font:loaded）
└── demo/          # node 端演示脚本
```

## 相关约定

- 环境差异（浏览器 / node 的 fabric bundle、字体注册）放在 `package.json` 的 `imports` 里，业务代码不做运行时判断。
- 图层能力按 mixin 组合（`withFillMode` / `withPixelFilter` / `withOutline` / `withMask`），不写一次性大类。
- 窗口级监听与尺寸观察统一用 `@vueuse/core`，作用域销毁自动解绑。

更细的说明见上面三份文档。