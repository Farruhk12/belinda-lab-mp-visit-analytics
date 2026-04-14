import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** GitHub Pages: в CI задать VITE_BASE_PATH=/belinda-lab-mp-visit-analytics/ при сборке */
function normalizeBase(p: string): string {
  if (!p || p === '/') return '/';
  return p.startsWith('/') ? (p.endsWith('/') ? p : `${p}/`) : `/${p.endsWith('/') ? p.slice(0, -1) : p}/`;
}

export default defineConfig(({ command, mode }) => {
  // `vite` / `npm run dev` → mode development: всегда корень, иначе с VITE_BASE_PATH в системе сайт «не открывается» на localhost:3000/
  // `vite build` → подставляем VITE_BASE_PATH для Pages
  // `vite preview` → mode production + serve: тот же base, что при сборке
  let base = '/';
  if (command === 'build') {
    base = normalizeBase(process.env.VITE_BASE_PATH || '/');
  } else if (command === 'serve' && mode === 'production') {
    base = normalizeBase(process.env.VITE_BASE_PATH || '/');
  }

  return {
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: false,
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
