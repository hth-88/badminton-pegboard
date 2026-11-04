/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'SUPABASE_', 'NEXT_PUBLIC_SUPABASE_'],
  test: {
    globals: true,
    environment: 'node',
  },
})
