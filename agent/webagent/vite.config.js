import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  //^regEx for locks
  server: {
    proxy: {
      '^/lock/.*': 'http://127.0.1.1:8080' ,
      '^/cells/.*': 'http://127.0.1.1:8080',
      '^/llm/.*': 'http://127.0.0.1:3001' 
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
