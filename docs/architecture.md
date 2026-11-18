# 项目架构说明

> fabric-core 是一个**可复用画布能力 + 最小编辑器脚手架**。
> 目标：把 fabric.js 7 的通用能力沉淀成 `src/libs`，编辑器只是这些能力的消费方。
> 本文档描述整体分层、数据流与扩展方式；具体能力见 [font-design.md](./font-design.md) 与 [image-layer-design.md](./image-layer-design.md)。

## 一、技术栈

| 类别 | 选型 |
| --- | --- |
| 构建 | Vite 8（rolldown）、TypeScript 5.9、`vue-tsc -b` |
| 框架 | Vue 3.5（`<script setup>`） |
| 画布 | fabric.js 7（纯 ESM、命名导出、内置类型） |
| UI | Naive UI（dark theme） |
| 工具 | `@vueuse/core`、`await-to-js`、`vue-json-pretty` |
| Node | `^20.19.0 || >=22.12.0`（Vite 8 要求），可选依赖 `canvas` 供 node 端使用 |

## 二、目录结构

```
├── index.html
├── vite.config.ts              # Vue 插件 + @ 别名 + 5173 端口
├── tsconfig.json               # 项目引用入口（app / node 两份）
├── tsconfig.app.json           # src 编译配置（composite / noUnused / @ 别名）
├── package.json                # 依赖 + imports(#fabric / #font-runtime)
├── docs/
│   ├── architecture.md         # 本文
│   ├── font-design.md          # 在线字体加载层 + FontText
│   └── image-layer-design.md   # ImageLayer 与图像 mixin
└── src/
    ├── main.ts                 # createApp + 副作用导入 libs（classRegistry 注册）
    ├── App.vue                 # NConfigProvider(dark) + NMessageProvider
    ├── style.css               # :root CSS 变量 + reset
    ├── font/                   # 加载层：URL 解析 → 按环境注册（不依赖 fabric/Vue）
    ├── libs/                   # 可复用图层：FontText、image/
    ├── config/                 # 声明式配置：sidebar.ts、property_form.ts
    ├── composables/            # 有状态 hook：编辑器命令、属性双向绑定、预览、侧栏拖拽
    ├── components/             # 编辑器 UI（三栏 + 属性面板 + 侧栏分组）
    ├── types/                  # fabric 模块增强（font:loaded）
    └── demo/                   # node 端端到端脚本（font.node.ts / image-layer.node.ts）
```

## 三、分层与依赖方向

```
components ──→ property/*
     │
     ├──────→ config
     │            │
     └──────→ composables ──→ config
                  │
                  └──────→ libs ──→ font
```

| 层 | 目录 | 允许依赖 | 职责 | 禁止 |
| --- | --- | --- | --- | --- |
| 加载层 | `src/font` | `#font-runtime`（fetch / FontFace / node-canvas） | URL 解析、`@font-face` 生成、注册、错误分类、缓存 | 不 import Vue / fabric |
| 图层层 | `src/libs` | `src/font`、`#fabric` | 可直接放进任意画布的自定义类（`FontText`、`ImageLayer`） | 不 import config / components / composables |
| 配置层 | `src/config` | fabric、`src/libs`、naive-ui | 侧栏按钮、表单 schema、控件映射 | 不放状态、不写模板 |
| 逻辑层 | `src/composables` | `src/config`、fabric、Vue | 命令、双向绑定、预览、拖拽 | 不写模板 |
| UI 层 | `src/components` | 以上全部 + naive-ui | 三栏布局、画布生命周期 | 不直接拼字段定义（交给 config） |

**判断新代码放哪里**：能不能脱离 Vue 单独用？能 → `libs`；只是纯数据 → `config`；需要响应式状态或画布交互 → `composables`；只负责渲染 → `components`。

## 四、运行时拓扑

```
App.vue                         NConfigProvider(darkTheme) + NMessageProvider
└── FabricEditor.vue            画布生命周期 + 三栏编排 + 状态归属
    ├── n-layout-sider (left)
    │   └── EditorSidebar.vue
    │       └── SidebarGroup.vue × N        SIDEBAR_GROUPS 驱动
    ├── PanelResizer.vue                   left
    ├── workspace > canvas                 唯一被 fabric 接管的 DOM
    ├── statusbar                         对象数 / 选中数
    ├── PanelResizer.vue                   right
    └── n-layout-sider (right)
        └── PropertyPanel.vue              属性 / 预览 两个 tab
            ├── PropertyForm.vue → PropertyField.vue
            └── n-image + vue-json-pretty
```

状态全部集中在 `FabricEditor.vue`：

| 状态 | 类型 | 说明 |
| --- | --- | --- |
| `canvas` | `shallowRef<Canvas \| null>` | fabric 实例，onMounted 创建 |
| `activeObject` | `shallowRef<FabricObject \| null>` | 仅单选时非空，多选为 null |
| `objectCount` / `selectedCount` | `ref<number>` | 状态栏与按钮可用性 |
| `activeTab` | `ref<string>` | `property` / `preview` |
| `leftWidth` / `rightWidth` 等 | `usePanelResize` | 侧栏宽度、收起、拖拽中 |

子组件**不发 emit**：数据用 props 下来，命令用函数 props 上去（`onAction`、`onAddImage`、`onTabChange`），保持单向数据流。

## 五、三条数据流

### 1. 命令流（配置驱动）

```
config/sidebar.ts (SIDEBAR_GROUPS)
        │
        ▼
EditorSidebar → SidebarGroup → 点击
        │
        ▼
onAction(item)  ──→  useEditorActions.onAction(item)
                          │ switch (item.action)
                          ├─ add-shape      → createShape(kind) → addObject
                          ├─ add-text       → new IText
                          ├─ add-font-text  → new FontText
                          ├─ front / back   → bringObjectToFront / sendObjectToBack
                          ├─ remove / clear
                          └─ pick-image     → 由 NUpload 直接回调 onAddImage(file)
                          │
                          ▼
                    canvas.add / setActiveObject / requestRenderAll
                          │
                          ▼
                    onChanged() → syncCounts()
```

新按钮 = 在 `config/sidebar.ts` 加一项 + 在 `useEditorActions.onAction` 加一个 `case`。

### 2. 属性流（双向绑定）

```
canvas 选中变化 / object:modified
        │
        ▼
readObject(object) → reactive model          useObjectModel
        │
        ▼
PropertyForm sections = [...BASE, ...LAYER].filter(s => s.match(object))
        │
        ▼
PropertyField  v-model:value → model[key]
        │
        ▼ watch(model, deep, flush: 'sync')
applyToObject()
  object.set(patch)
  若对象有 refresh() → 调用（ImageLayer 重跑图像管线）
  setCoords / dirty / requestRenderAll
```

`applying` 守卫防止「读对象 → 改模型 → 又写对象」的循环。

### 3. 预览流

```
任意场景事件 → syncPreview()
   useCanvasPreview:
     syncJson  防抖 120ms  → canvas.toObject() → JSON.stringify
     syncImage 防抖 320ms  → canvas.toDataURL('png')   （activeTab === 'preview' 才生成）
```

## 六、画布生命周期（FabricEditor.vue）

| 时机 | 行为 |
| --- | --- |
| `onMounted` | `new Canvas(el, { backgroundColor:'#fff', preserveObjectStacking:true, selection:true, controlsAboveOverlay:true })`，随后 `resize()` |
| 容器尺寸变化 | `useResizeObserver(workspaceRef)` → `canvas.setDimensions` + `requestRenderAll` |
| 选中变化 | `selection:created / updated / cleared` → `syncCounts()` |
| 场景变化 | `object:added / removed / modified`、`text:changed` → `syncPreview()` |
| 滚轮 | 仅 `Ctrl/Cmd + wheel`，缩放夹在 `0.2 ~ 4`，用 `canvas.getViewportPoint(e)` 定位 |
| 键盘 | `useEventListener(window,'keydown')`：输入框内 / IText 编辑态不拦截；Delete/Backspace 删除选中 |
| 卸载 | `onBeforeUnmount` → `canvas.dispose()` |

缩放 / 键盘 / 尺寸观察全部用 `@vueuse/core`，作用域销毁自动解绑，不手写 `addEventListener` + `removeEventListener`。

## 七、配置驱动的前端

### `config/sidebar.ts`

```ts
type ActionName = 'add-shape' | 'add-text' | 'add-font-text' | 'pick-image' | 'front' | 'back' | 'remove' | 'clear'

interface SidebarItem {
  label: string
  action: ActionName
  payload?: unknown           // add-shape 用 { kind, label }
  type?: 'default' | 'primary' | 'error'
  secondary?: boolean
  tertiary?: boolean
  requiresSelection?: boolean // 置顶/置底/删除用
}

interface SidebarGroup { title: string; columns: 1 | 2; items: SidebarItem[] }
```

`SidebarGroup.vue` 只负责渲染：`requiresSelection && !hasSelection` 时禁用；`action === 'pick-image'` 外面套 `n-upload`。

### `config/property_form.ts`

| 概念 | 说明 |
| --- | --- |
| `ShapeModel` | 表单模型，只放属性面板会编辑的字段 |
| `FieldKind` | `number / numberPair / color / slider / select / text / textarea / tag / readonly` |
| `FieldDef` | `key`（单个或成对）+ `label` + `kind` + `props` + `display` |
| `SectionDef` | `title?` + `match(object)` + `fields`，match 可叠加 |
| `FIELD_COMPONENTS` | `FieldKind → naive-ui 组件` |
| `FIELD_DEFAULT_PROPS` | 控件默认 props，schema 里的 `props` 覆盖它 |
| `BASE_SECTIONS` | 所有图层都有：位置 / 角度 / 不透明度 / 填充 / 描边 / 线宽 |
| `LAYER_SECTIONS` | 按 `instanceof` 匹配：Rect / Circle / Ellipse / Textbox / FabricImage / IText / FontText / ImageLayer |

约定：

- 颜色控件统一带「清空」（`actions: ['clear','confirm']`），清空后值为 `null`。
- 成对字段用 `key: ['left','top']`，渲染成两个 number 输入。
- 只读字段用 `kind: 'readonly' | 'tag'` + `display` 回调，不参与写回。

## 八、composables

| 文件 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- |
| `useEditorActions` | `canvas`、`message`、`onChanged` | `onAction / addShape / addText / addFontText / addImage / removeSelected` 等 | 所有编辑器命令；`placeRandom` 按包围盒随机摆放 |
| `useObjectModel` | `canvas`、`object` | `model`、`syncFromObject`、`applyToObject` | 对象 ↔ 表单双向绑定 |
| `useCanvasPreview` | `canvas`、`enabled` | `json`、`image`、`sync` | 防抖生成 JSON 与 PNG |
| `usePanelResize` | `initial/min/max/direction` | `width`、`collapsed`、`resizing`、`onPointerDown` | 侧栏拖动 / 单击收起，3px 阈值区分点击 |

## 九、构建与环境

### 模块解析（package.json `imports`）

```json
{
  "#fabric": { "node": "fabric/node", "default": "fabric" },
  "#font-runtime": { "node": "./src/font/runtime.node.ts", "default": "./src/font/runtime.browser.ts" }
}
```

- 同一份源码，浏览器 / node 走不同实现，业务代码里**没有环境判断**。
- `src/libs/index.ts`（浏览器）与 `src/libs/node.ts`（node）导出同一批类；两边的 `classRegistry` 是独立的，
  各自注册各自的 `FontText` / `ImageLayer`。
- 新增需要环境差异的能力时，照这个模式加 `imports` 条目，不要在运行时注入。

### 脚本

```bash
npm run dev              # vite
npm run build            # vue-tsc -b && vite build
npm run preview
npm run typecheck        # vue-tsc -b --force
npm run demo:font:node   # node 端字体端到端演示
npm run demo:image:node  # node 端 ImageLayer 端到端演示
```

### TypeScript

- `composite: true` + 项目引用；`vue-tsc -b` 会做 declaration emit，匿名类导出容易触发 TS4023/TS4094（见 image 文档里的 `Mixin<>` 写法）。
- `noUnusedLocals / noUnusedParameters` 开启，注释掉的变量也要删。
- 路径别名 `@/*` → `src/*`（vite.config.ts 与 tsconfig.app.json 两处同步）。

## 十、样式

`src/style.css` 定义全局变量：

| 变量 | 用途 |
| --- | --- |
| `--bg` / `--panel` / `--panel-2` | 页面与面板底色 |
| `--line` | 分隔线 |
| `--text` / `--text-dim` | 主 / 次文字 |
| `--accent` | 强调色 |

- Naive UI 用 `darkTheme`；`App.vue` 给 `n-config-provider` 加 `height: 100%`，否则内层 `height:100%` 全部失效。
- 组件样式一律 `<style scoped>`，跨组件只通过 CSS 变量共享。

## 十一、扩展指南

| 想做什么 | 改哪里 |
| --- | --- |
| 新增基础图形 | `config/sidebar.ts` 加按钮 → `useEditorActions.createShape` 加 `case` → `ShapeKind` 加类型 |
| 新增可编辑属性 | `ShapeModel` 加字段 → 对应 `SectionDef.fields` → `useObjectModel.readObject` 补读取 |
| 新增自定义图层 | 类放 `src/libs` 并从 `index.ts` 导出 → `classRegistry.setClass` → `property_form` 加 section → `sidebar.ts` + `onAction` 加创建入口 |
| 新增字段控件 | `FieldKind` 加类型 → `FIELD_COMPONENTS` 映射 → `FIELD_DEFAULT_PROPS` 默认 props |
| 改字体加载行为 | 只动 `src/font/`，上层不用改 |
| 给图像加能力 | `src/libs/image/mixins` 加一个 `withX`，按既有顺序组合（详见 image 文档） |
| 加侧栏分组 | `SIDEBAR_GROUPS` 加一项，无需改 UI |
| 新增 node 端演示 | 放 `src/demo/*.node.ts`，从 `../libs/node.ts` 引入，加一条 `demo:*:node` 脚本 |

## 十二、约定与坑

1. **全局监听用 `@vueuse/core`**：`useEventListener` / `useResizeObserver`，不要手写 `window.addEventListener` + 手动解绑。
2. **环境差异放构建/解析层**：不要在业务代码里写 `typeof window`、工厂注入或 `if (node)`。
3. **图层能力用 mixin 组合**：不要写一个只服务单一业务的巨型类。
4. **fabric 7 是命名导出**：`import { Canvas, Rect, FabricImage, Textbox, util } from 'fabric'`；`Line` 已废弃，用 `Polyline`。
5. **`classRegistry` 必须早于反序列化**：浏览器在 `main.ts` 里副作用导入 `./libs/index.ts`；node 从 `libs/node.ts` 引入。
6. **子组件不用 emit**：数据 props 下来、命令函数 props 上去，保持单向。
7. **配置层不放状态**：`config/` 只描述「有什么」，状态在 `composables` 与 `FabricEditor`。
8. **表单写回要触发副作用**：修改 `scaleX/width` 等尺寸后调用 `setCoords()`；自定义图层若有 `refresh()`，`useObjectModel` 会自动调用。

## 十三、文档索引

- [font-design.md](./font-design.md) — 字体解析、两端注册、FontText 状态机与自动宽度
- [image-layer-design.md](./image-layer-design.md) — ImageLayer 管线、mixin 拆分、描边 / 蒙版 / 滤镜实现细节