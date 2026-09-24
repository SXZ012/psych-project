import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/terminal.css'
import './styles/product-theme.css'

createApp(App).use(createPinia()).mount('#app')
