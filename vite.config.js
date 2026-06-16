import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Transpile down so the built app runs on older Safari too (e.g. iPad 4th gen /
// iOS 10) — modern JS syntax like ?. and ?? gets compiled to ES2015.
export default defineConfig({
  plugins: [react()],
  build: { target: ['es2015', 'safari11'] },
})
