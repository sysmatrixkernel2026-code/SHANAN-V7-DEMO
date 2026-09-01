import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// P3-1: Content-Security-Policy (Stage 2) for the SPA document.
// The app only needs 'self', Google Fonts (styles/fonts), and images.pexels.com
// (Home/HeroShowcase <img>). Verified via browser: the Google Fonts <link>
// stylesheet is served from fonts.googleapis.com (governed by style-src) and the
// .woff2 files come from fonts.gstatic.com (governed by font-src). No inline or
// external application scripts or eval are used, so script-src is 'self' (plus a
// specific SHA-256 hash for @vitejs/plugin-react's dev-only refresh preamble —
// the hash was observed in the browser dev console; it does not apply to the
// production bundle which has no inline scripts). CSS is injected as <style> at
// runtime and the components use pervasive inline style= attributes, so style-src
// / style-src-attr require 'unsafe-inline' (the application's real dependency —
// there is no nonce/hash infrastructure).
//
// Developer-mode HMR needs a WebSocket to the dev server and the API is called
// directly at http://localhost:3001, so the dev policy extends connect-src.
// The production (build) policy is stricter: script-src is 'self' only and
// connect-src is 'self' only.
//
// SHA-256 of @vitejs/plugin-react's dev refresh preamble (observed in console):
const DEV_PREAMBLE_HASH = 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='
const GOOGLE_FONTS_STYLES = 'https://fonts.googleapis.com'

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLES}`,
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https://images.pexels.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ')

const DEV_CSP = [
  "default-src 'self'",
  `script-src 'self' '${DEV_PREAMBLE_HASH}'`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLES}`,
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https://images.pexels.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' http://localhost:3001 ws://localhost:3000",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ')

function cspMetaPlugin(): Plugin {
  return {
    name: 'shanan-csp-meta',
    transformIndexHtml(html, ctx) {
      // ctx.server is present when index.html is transformed by the dev server,
      // and absent during a production build.
      const policy = ctx.server ? DEV_CSP : PROD_CSP
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`
      // Inject right after the <head> opener so the meta sits inside <head>.
      return html.replace('<head>', '<head>\n    ' + meta)
    },
  }
}

export default defineConfig({
  plugins: [react(), cspMetaPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
