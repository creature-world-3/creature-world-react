import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase')) return 'firebase';
          if (id.includes('react-router')) return 'react-router';
          if (id.includes('react-dom') || id.includes('react/')) return 'react-core';
        },
      },
    },
  },
})
