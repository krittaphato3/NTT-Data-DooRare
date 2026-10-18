import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { authPlugin } from './server/authPlugin';

export default defineConfig({
  plugins: [react(), authPlugin()],
  server: { port: 5173 },
  preview: { port: 4173 },
});

