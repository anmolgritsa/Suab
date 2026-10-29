import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// `base` must match the public URL the app is served from. GitHub Pages
// hosts the deploy repo at https://anmolgritsa.github.io/Suab-deploy/, so
// every built asset URL is prefixed with /Suab-deploy/ (see DEPLOY.md).
// Local dev, `vite preview` and the browser test scripts keep working —
// they read the resolved URL from the Vite server, which already includes
// the base path.
export default defineConfig({
  base: '/Suab-deploy/',
  plugins: [react()],
})
