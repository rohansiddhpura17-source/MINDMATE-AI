import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// NOTE: The `/ollama` proxy below is a Vite development server feature that forwards
// browser requests to the local Ollama HTTP daemon at http://127.0.0.1:11434.
// Static production builds do not run Vite's dev proxy; in production deployments,
// configure `VITE_OLLAMA_BASE_URL=http://127.0.0.1:11434` with `OLLAMA_ORIGINS` enabled.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
    },
  },
  build: {
    // Raise limit for ML and visualization bundles
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Split charting library
          'vendor-recharts': ['recharts'],
          // Split Supabase client
          'vendor-supabase': ['@supabase/supabase-js'],
          // Split icons
          'vendor-icons': ['lucide-react'],
          // Split WebLLM inference engine
          'vendor-webllm': ['@mlc-ai/web-llm'],
          // Split Mermaid visual diagramming engine
          'vendor-mermaid': ['mermaid'],
          // Split OCR and document processing
          'vendor-ocr': ['tesseract.js'],
          'vendor-pdf': ['pdfjs-dist'],
        },
      },
    },
  },
})
