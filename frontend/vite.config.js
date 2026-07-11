import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/VN-flight-tracker-limited/',  // Match your GitHub repo name
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
