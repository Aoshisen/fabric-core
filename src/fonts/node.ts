/**
 * node 入口。
 *
 * 只是 `./index.ts` 的别名入口：fabric / fabric/node 的选择发生在模块解析阶段
 * （package.json 的 `imports.#fabric`），代码里没有环境分支，也没有工厂注入。
 *
 * ⚠️ 仍然不要和浏览器入口混用：fabric 与 fabric/node 的 classRegistry 是两份，
 * 混用会导致 enlivenObjects 反序列化时找不到 FontText。
 */
export * from './index.ts'
