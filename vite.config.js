import { defineConfig } from 'vite';

// Client source lives in client/, builds to client/dist. `npm start` serves
// the build with `vite preview`; `npm run dev` serves it directly on :5173.
export default defineConfig({
  root: 'client',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
