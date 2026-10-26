import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5120,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5121',
        changeOrigin: true,
      },
      '/gssm-api': {
        target: 'http://127.0.0.1:5175',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gssm-api/, ''),
      },
    }
  }
})
