# ImageLayer 实现说明（fabric 7）

> 把 `admin-custom-option/src/pages/template-prod/lib/objects/UploadPicture.ts`（1526 行）重写为
> `src/libs/image/` 下**可组合的 mixin + 一条单向图像管线**。
>
> 保留：填充方式、蒙版遮罩、去白底、单色滤镜、描边。
> 移除：「买家可拖动 / 缩放 / 旋转图片本体」的整套编辑态。
>
> 本文档描述的是**当前代码的真实实现**，用于后续修改前快速定位。

## 一、已确认的边界

| 议题 | 决定 |
| --- | --- |
| 旧数据兼容 | 不做。字段全新命名，没有迁移层 |
| 描边位置 | `outlineAlign: 'outer' \| 'inner'`，外描边是原实现，内描边新增 |
| 单色滤镜 | 可独立于去白底；`null` / `''` / `'transparent'` / alpha=0 都算关闭 |
| 去白底 | fabric 内置 `filters.RemoveColor` |
| 蒙版模式 | 只做一种：蒙版图 cover 铺满、正向裁剪（按 alpha 保留） |
| 外层虚线框 | 不要。`ImageLayer` 直接 `extends FabricImage`，没有 Group、没有 `_rect` |
| 运行环境 | 浏览器 + node。node 依赖可选包 `canvas`，由 `#fabric` 解析到 `fabric/node`，见 `npm run demo:image:node` |

## 二、文件与职责

```
src/libs/image/
├── types.ts                    # 选项类型、能力契约、ImageLayerBase、Mixin 工具类型
├── imageio.ts                  # createCanvas / copyToCanvas / loadImage
├── pixels.ts                   # composeBase（构图）+ applyPixelFilters + normalizeTintColor
├── outline.ts                  # alpha 分析、轮廓追踪、外/内描边画布
├── mixins/
│   ├── withImagePipeline.ts    # 管线基座：加载、refresh、布局、memo、dispose
│   ├── withFillMode.ts         # contain | fill
│   ├── withPixelFilter.ts      # RemoveColor + BlendColor(tint)
│   ├── withOutline.ts          # 描边宽度换算 + 调用 outline
│   └── withMask.ts             # clipPath 蒙版
├── ImageLayer.ts               # 组合 + 构造参数 + 序列化 + classRegistry
└── index.ts                    # 对外导出
```

依赖方向：`ImageLayer.ts` → `mixins/*` → `pixels / outline / imageio`。`pixels` 与 `outline` 不互相依赖。

## 三、类型契约

```ts
// types.ts
export type FillMode = 'contain' | 'fill'
export type StrokeAlign = 'outer' | 'inner'

export type Constructor<T = object> = new (...args: any[]) => T
export type ImageLayerBase = FabricImage & ImageLayerHost
/** 组合 mixin 的返回类型：保留原实例类型 + 叠加能力 */
export type Mixin<TBase extends Constructor, TAdd> = Constructor<InstanceType<TBase> & TAdd>

export interface ImageLayerHost {
  frameWidth: number
  frameHeight: number
  sourceElement: HTMLImageElement | null
  refresh(): Promise<void>
  _buildBase(source: HTMLImageElement): HTMLCanvasElement
  _buildDisplay(base: HTMLCanvasElement): HTMLCanvasElement
  _syncLayout(display: HTMLCanvasElement): void
  _syncMask(display: HTMLCanvasElement): Promise<void>
  _contentKey(): string
}
```

每个 mixin 的签名统一为：

```ts
export function withX<TBase extends Constructor<ImageLayerBase>>(Base: TBase): Mixin<TBase, XCapability>
```

返回类型必须写成 `Mixin<...>` 并 `as unknown as` 断言，否则 `tsc` 的 declaration emit 会报
TS4023 / TS4094（匿名类暴露了 fabric 的 private 成员）。

## 四、渲染管线（真实执行顺序）

```
setSource / setFrame / setFillMode / setPixelFilter / setOutline / setMask
                        │
                        ▼
                    refresh()                       // withImagePipeline
      ┌──────────────────────────────────────────┐
      │ version = ++_version                     │
      │ key = _contentKey()                      │
      │ key 命中 _memo → 直接复用 {base, display}  │
      │ 否则:                                    │
      │   base = _buildBase(source)              │
      │          ├ composeBase(contain/fill)     │  withFillMode
      │          └ applyPixelFilters(...)        │  withPixelFilter（内部调 super -> compose）
      │   display = _buildDisplay(base)           │  withOutline
      │   _memo = { base, display }               │
      │ _syncLayout(display)                      │  设 width/height/scale
      │ await _syncMask(display)                  │  withMask
      │ dirty = true; canvas?.requestRenderAll()  │
      └──────────────────────────────────────────┘
```

mixin 的覆盖关系（自上而下等价于装饰顺序）：

| 环节 | 覆写的钩子 | 组合时的位置 |
| --- | --- | --- |
| `withFillMode` | `_buildBase` | 最内层（先构图） |
| `withPixelFilter` | `_buildBase`（`super._buildBase` 之后再滤镜） | 包住 fill |
| `withOutline` | `_buildDisplay`（`super._buildDisplay` 之后描边） | 包住 pixelFilter |
| `withMask` | `_syncMask` | 最外层 |

```ts
// ImageLayer.ts
const Composed = withMask(
  withOutline(withPixelFilter(withFillMode(withImagePipeline(FabricImage)))),
)
```

## 五、各模块实现细节

### 5.1 imageio.ts

```ts
createCanvas(w, h)   // util.createCanvasElement() + 取整、限制 >= 1
copyToCanvas(source) // 新建同尺寸画布并 drawImage
loadImage(src)       // util.loadImage(src, { crossOrigin: 'anonymous' })
```

- `crossOrigin` 必须保留：去白底要 `getImageData`、描边要读 alpha，跨域图不设会污染 canvas。
- 画布统一走 fabric 的 `util.createCanvasElement`，内部经 `getFabricDocument()`，不直接碰 `document`。

### 5.2 pixels.ts

```ts
composeBase(source, frameWidth, frameHeight, fillMode): HTMLCanvasElement
normalizeTintColor(value: string | null | undefined): string | null
applyPixelFilters(source, state): HTMLCanvasElement
```

**composeBase**（画布分辨率 = 源图像素，宽高比 = 图层框）：

| 模式 | 画布尺寸 | 源图位置 |
| --- | --- | --- |
| `contain` | 源图等比放大到刚好容纳（letterbox 到框比例） | 居中，四周透明 |
| `fill` | 按框比例裁到「覆盖」尺寸 | 居中，超出部分被画布裁掉 |

`dx = (canvas.width - sourceWidth) / 2`，负值即裁切。因为画布已经是框比例，**不需要再挂矩形 clipPath**。

**normalizeTintColor**：

```ts
if (!value) return null
const raw = value.trim()
if (!raw || /^(transparent|none)$/i.test(raw)) return null
const [, , , alpha] = new Color(raw).getSource()
return alpha === 0 ? null : raw
```

**applyPixelFilters**：`RemoveColor` → `BlendColor`，通过 `Canvas2dFilterBackend.applyFilters` 跑：

```ts
const list = []
if (state.removeWhite) list.push(new filters.RemoveColor({ color: '#ffffff', distance: whiteDistance(state.whiteThreshold) }))
const tint = normalizeTintColor(state.tintColor)
if (tint) list.push(new filters.BlendColor({ color: tint, mode: 'tint', alpha: 1 }))
if (!list.length) return source
backend.applyFilters(list, source, w, h, targetCanvas)
```

- `whiteDistance = (255 - threshold) / 255`（默认阈值 180 → 0.294）。
- `RemoveColor` 是**逐通道区间判定**（`|r-255| < d*255` 且 g、b 同理），不是欧氏距离。
- 顺序固定：先去白底再染色。染色的 alpha 保持不变。
- `applyFilters` 会先 `drawImage(source)` 到 target，再读像素，所以 target 一定另建画布。

### 5.3 outline.ts

常量：`ALPHA_THRESHOLD = 112`、`MIN_CONTOUR_AREA = 40`、8 邻域方向表。

```ts
outlineMargin(strokeWidth, align)          // inner: 0；outer: ceil(w) + 4
analyzeAlpha(source)                       // 一次扫描同时产出 mask + 白色剪影
isBoundary / traceBoundary / extractContours
contoursToPath2D(contours, offsetX, offsetY)
buildOutlinedCanvas(source, { sourcePixelWidth, color, align })
```

`analyzeAlpha` 的实现要点：

1. 新建画布 `drawImage(source)`，`getImageData` 读 alpha，按阈值写 `Uint8Array mask`（0/1）。
2. **同一块画布**继续 `globalCompositeOperation = 'source-in'` + `fillRect(白色)` 得到白色剪影。
   - 剪影使用原始 alpha（抗锯齿），mask 使用二值阈值；两者用途不同，不要合并。
   - 这里刻意**不**再逐像素写 `ImageData`。

`buildOutlinedCanvas`：

| 对齐 | 画布 | 绘制顺序 |
| --- | --- | --- |
| `outer` | `source + 2 * margin`（margin = ceil(w)+4） | `stroke(path)` → `destination-out` 画剪影 → `source-over` 画原图 |
| `inner` | `source`（margin = 0） | 画原图 → `source-atop` 画 stroke |

- 线宽一律 `strokeWidth * 2`：外描边有一半落在形状外、内描边有一半被 `source-atop` 裁掉，
  所以可见宽度都是 `strokeWidth`。
- 没有轮廓（`contours.length === 0`）时返回原画布。

### 5.4 withImagePipeline.ts

字段：

```ts
frameWidth = 300
frameHeight = 300
sourceElement: HTMLImageElement | null = null
declaredSrc: string | null = null
_version = 0        // refresh 版本号（异步防竞态）
_sourceToken = 0    // 换图防竞态
_memoKey = ''
_memo: { base, display } | null = null
```

方法：

| 方法 | 行为 |
| --- | --- |
| `setSource(src \| null)` | `declaredSrc = src`、token++、清 memo；非空则 `loadImage`，token 未变才赋值并 `refresh` |
| `setSourceElement(el)` | 反序列化用：图片已加载好，直接作为源图 |
| `setFrame(w, h)` | 改框尺寸，清 memo，refresh |
| `refresh()` | 见「渲染管线」，内部有 version + memo 双重保护 |
| `dispose()` | 清 memo / sourceElement / clipPath，再 `super.dispose()` |

**_syncLayout 是缩放的唯一入口**：

```ts
this.setElement(display)          // width/height = display 尺寸（fabric 用它做源矩形裁剪）
this.set({
  scaleX: this.frameWidth / display.width,
  scaleY: this.frameHeight / display.height,
})
this.setCoords(); this.set('dirty', true)
```

**_contentKey**（基座部分）：`${_sourceToken}|${frameWidth}x${frameHeight}`，后续 mixin 依次拼自己的参数。

### 5.5 withFillMode.ts

- 字段：`fillMode: 'contain' | 'fill' = 'contain'`
- `_buildBase` 直接调 `composeBase(source, frameWidth, frameHeight, fillMode)`（不调 super）。
- `_contentKey` 追加 `|fill:${fillMode}`。
- `setFillMode(mode)` 相同值直接返回。

### 5.6 withPixelFilter.ts

- 字段：`removeWhite = false`、`whiteThreshold = 180`、私有 `_tintColor = null`。
- `tintColor` 是**访问器**，setter 统一走 `normalizeTintColor`：

```ts
get tintColor() { return this._tintColor }
set tintColor(value: string | null | undefined) { this._tintColor = normalizeTintColor(value) }
```

fabric 的 `set()` 最终是属性赋值，所以 `object.set({ tintColor: null })` 也会被归一化。

- `_buildBase`：`applyPixelFilters(super._buildBase(source), { ...this三个字段 })`。
- `_contentKey` 追加 `|px:${removeWhite}:${whiteThreshold}:${tintColor ?? ''}`。

### 5.7 withOutline.ts

- 字段：`outlineWidth = 0`（屏幕像素）、`outlineColor = '#ffffff'`、`outlineAlign = 'outer'`。
- `_buildDisplay`：

```ts
const display = super._buildDisplay(base)          // 目前是恒等
if (this.outlineWidth <= 0 || !base.width) return display

const scale = this.frameWidth / base.width
let sourcePixelWidth = this.outlineWidth / scale
if (this.outlineAlign === 'outer') {
  // 外描边会扩画布，整体缩放比变小，按最终画布宽度反算两次收敛
  for (let i = 0; i < 2; i++) {
    const margin = outlineMargin(sourcePixelWidth, 'outer')
    sourcePixelWidth = (this.outlineWidth * (base.width + margin * 2)) / this.frameWidth
  }
}
return buildOutlinedCanvas(display, {
  sourcePixelWidth,
  color: this.outlineColor || '#ffffff',   // 颜色被清空（null）时回退白色
  align: this.outlineAlign,
})
```

- `_contentKey` 追加 `|outline:${width}:${color}:${align}`。

### 5.8 withMask.ts

- 字段：`maskSrc: string | null = null`。
- 模块级 `maskCache: Map<url, Promise<HTMLImageElement>>`，失败时删缓存以便重试。
- `_syncMask(display)`：

```ts
await super._syncMask(display)
if (!maskSrc) { this.clipPath = undefined; dirty = true; return }
const mask = await loadMaskImage(src)
if (src !== this.maskSrc) return                  // 地址变了，丢弃旧结果
const scale = Math.max(display.width / mask.width, display.height / mask.height) || 1
this.clipPath = new FabricImage(mask, {
  originX: 'center', originY: 'center', left: 0, top: 0,
  scaleX: scale, scaleY: scale, excludeFromExport: true,
})
```

- **没有 token**：同一地址共用同一个缓存 Promise，回调按发起顺序执行，后发起的 refresh 天然后写；
  不同地址由 `src !== this.maskSrc` 拦掉。改动 `maskCache` 的缓存策略时，需要重新评估这个假设。
- `excludeFromExport` 防止蒙版 base64 进 JSON；`dispose()` 只清引用，不 dispose 蒙版元素（多图层共用）。

### 5.9 ImageLayer.ts

```ts
const Composed = withMask(withOutline(withPixelFilter(withFillMode(withImagePipeline(FabricImage)))))

class ImageLayer extends Composed {
  static type = 'ImageLayer'
  static customProperties = [...FabricImage.customProperties, ...SERIALIZED_PROPS]
}
```

构造函数有两个重载：`new ImageLayer(options)` 与 `new ImageLayer(element, options)`；
运行时用「是否 HTMLImageElement / HTMLCanvasElement」区分 options 与 element。

关键顺序（**不要改**）：

1. 从 `options` 解构出所有自定义字段，`...rest` 传给 `super(element, rest)`。
2. `super()` 之后再逐项赋值自定义字段。
3. 最后决定加载路径：
   - `element` 是 `HTMLImageElement` → 反序列化路径，`setSourceElement(element)`；
   - 否则有 `src` → `setSource(src)`。

原因：fabric 的构造函数会先 `setOptions(options)`，而子类字段初始化在 `super()` 之后执行，
自定义字段如果跟着 `rest` 进 `super()` 会被字段默认值覆盖。

`getSrc()` 被覆写为返回 `declaredSrc`，避免 fabric 把显示画布编码成 base64 写进 JSON。

## 六、序列化 / 反序列化

- `SERIALIZED_PROPS`（位于 ImageLayer.ts）：
  `src, frameWidth, frameHeight, fillMode, removeWhite, whiteThreshold, tintColor, outlineWidth, outlineColor, outlineAlign, maskSrc`
- 只有 `ImageLayer` 维护 `static customProperties`；各 mixin 不声明静态字段（避免静态侧互相覆盖与声明报错）。
- 反序列化走 fabric 的 `FabricImage.fromObject`：它会先按 `src` 加载图片，再 `new this(element, options)`，
  所以构造函数必须支持 `(HTMLImageElement, options)`。
- `classRegistry.setClass(ImageLayer)`，`type = 'ImageLayer'`。
- `filters` 永远是空数组（像素处理在画布上完成），`clipPath` 由 `maskSrc` 重建。

## 七、API

```ts
import { ImageLayer } from '@/libs'

const layer = new ImageLayer({
  src: 'https://cdn.example.com/a.png',
  frameWidth: 300,
  frameHeight: 300,
  fillMode: 'contain',
  removeWhite: true,
  whiteThreshold: 180,
  tintColor: '#111111',
  outlineWidth: 2,
  outlineColor: '#ffffff',
  outlineAlign: 'outer',
  maskSrc: 'https://cdn.example.com/mask.png',
})
canvas.add(layer)
```

| 成员 | 说明 |
| --- | --- |
| `setSource(src \| null)` | 换源图 / 清空 |
| `setFrame(w, h)` | 改图层框尺寸 |
| `setFillMode(mode)` | contain / fill |
| `setPixelFilter({ removeWhite, whiteThreshold, tintColor })` | 去白底 / 单色 |
| `setOutline({ outlineWidth, outlineColor, outlineAlign })` | 描边 |
| `setMask(src \| null)` | 蒙版 |
| `refresh()` | 直接改属性后手动重算 |
| `dispose()` | 释放缓存与源图引用 |

只想要部分能力：

```ts
class Outlined extends withOutline(withImagePipeline(FabricImage)) {}
class Thumb extends withOutline(withPixelFilter(withFillMode(withImagePipeline(FabricImage)))) {}
```

注意：`withFillMode` / `withPixelFilter` / `withOutline` / `withMask` 都要求宿主满足
`ImageLayerBase`（即已经 `withImagePipeline`），不能直接挂在裸 `FabricImage` 上。

## 八、业务接入（demo 现状）

| 位置 | 改动 |
| --- | --- |
| `src/libs/index.ts` | 导出 `ImageLayer`、`loadImage` 与全部 mixin / 类型 |
| `src/config/property_form.ts` | `ShapeModel` 新增 7 个字段；新增「图片图层」section（`match: object instanceof ImageLayer`） |
| `src/config/property_form.ts` | `FIELD_DEFAULT_PROPS.color` 统一带 `actions: ['clear', 'confirm']`，所有颜色可清空为 `null` |
| `src/composables/useObjectModel.ts` | `readObject` 读取 ImageLayer 字段；`applyToObject` 写完若对象有 `refresh()` 就调用 |
| `src/composables/useEditorActions.ts` | 图片上传改成 data URL + `loadImage` + `new ImageLayer(element, { src, frameWidth, frameHeight })` |

颜色字段清空后的语义：

| 字段 | 清空后 |
| --- | --- |
| `fill` / `stroke` | `null`，fabric 视为无填充 / 无描边 |
| `tintColor` | `null`，关闭单色滤镜 |
| `outlineColor` | `null`，渲染回退 `#ffffff`（开关仍由 `outlineWidth` 控制） |

## 八点五、node 端演示

```bash
npm run demo:image:node   # 输出 dist/node-image-layer-demo.png
```

`src/demo/image-layer.node.ts` 用 node-canvas 在内存里生成三张测试图（白底样图 / 透明星形图标 / 圆形蒙版），
覆盖 contain、fill、去白底、单色、外描边、内描边、蒙版、以及「fill + 去白底 + 单色 + 外描边 + 蒙版」组合，
最后打印每层的 frame / display / scale，并做一次 `toObject → enlivenObjects` 往返校验。

## 九、必须遵守的不变量（改代码前先看）

1. **`width/height` 是源矩形裁剪尺寸，不是缩放**。不要为了「让描边不撑大框」把 width 压回 base；
   直接让 display 尺寸当 width，再用 scale 缩回框。
2. **display 才是最终绘制内容**。`_syncLayout`、`_syncMask` 都只接收 display。
3. **外描边会让图片等比缩小**，内描边不改变图片尺寸（margin = 0）。
4. **构图先于滤镜**。contain 的留白是透明像素，不会影响 RemoveColor / 取色。
5. **mixin 顺序固定**：fill → pixelFilter → outline → mask。换顺序会导致 `super` 链语义变化。
6. **自定义字段不要进 `super(options)`**，否则被类字段默认值覆盖。
7. **蒙版按 alpha 保留**，蒙版图必须带透明通道；缩放基准是 display，不是 base。
8. **`_contentKey` 新增参数时，对应 setter 必须同时更新它**，否则缓存不会失效。
9. **异步结果要校验**：换图用 `_sourceToken`，整体刷新用 `_version`，蒙版用 `src !== this.maskSrc`。
10. **不引入浏览器专属 API**：画布统一走 `util.createCanvasElement()`；轮廓路径用 `ctx.beginPath()/quadraticCurveTo()` 而不是 `Path2D`（node-canvas 没有全局 `Path2D`）。相对 import 带 `.ts` 扩展名，node ESM 才能直接跑。
11. **node 端元素识别**：node 没有全局 `HTMLImageElement`，`ImageLayer.isImageElement` 通过构造函数名（`HTMLImageElement / Canvas`）兜底，反序列化时才能把已加载的图片当成 element 而不是 options。

## 十、常见修改指引

| 想改什么 | 改哪里 |
| --- | --- |
| 填充算法（object-fit: scale-down / none 等） | `pixels.composeBase` + `types.FillMode` |
| 去白底阈值语义 | `pixels.whiteDistance` |
| 换滤镜（灰度、色相） | `pixels.applyPixelFilters` 的 filters 列表 |
| 描边算法 / 平滑度 | `outline.ts`（阈值、邻域、贝塞尔控制点） |
| 描边扩边量 | `outline.outlineMargin` |
| 内/外描边行为 | `outline.buildOutlinedCanvas` 的两个分支 |
| 蒙版铺满策略 / 反向遮罩 | `withMask._syncMask`（可加 `clipPath.inverted`） |
| 新增一个能力 | 新建 `withX.ts`，覆写对应钩子，在 `ImageLayer` 的 `Composed` 链里加一层，并补 `SERIALIZED_PROPS` |
| 新增可序列化字段 | `SERIALIZED_PROPS` + 构造函数解构 + `_contentKey` |
| 属性面板字段 | `config/property_form.ts` 的 ImageLayer section + `useObjectModel.readObject` |

## 十一、暂缓 / 后续可加

- 反向遮罩（`clipPath.inverted`）、蒙版铺满策略（`coverMaskArea`）
- 描边居中（`'center'`）、虚线描边
- node 端业务打包入口（当前只有 demo 验证链路可用）
- 大图性能：目前每次参数变化都会重跑整条管线（仅实例内 memo 兜底），后续可加跨图层 LRU 缓存或 WebGL filter backend