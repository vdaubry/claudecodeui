import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.test.js', '**/*.test.jsx'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./src/test-setup.js'],
  },
});
