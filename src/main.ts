import { createApp } from 'vue'
// 副作用：把自定义 FontTextBox 注册到浏览器端 fabric 的 classRegistry，
// 这样从 JSON 反序列化（enlivenObjects / loadFromJSON）时才能识别该图层
import './libs/index.ts'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
