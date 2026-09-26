import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// connect-src 'none' blocks fetch, XHR, and WebSockets, so the page has no way to call a server.
// style-src needs 'unsafe-inline' because CodeMirror injects its styles at runtime.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// frame-ancestors only works as an HTTP header, so it is added there and not to the meta tag.
const RESPONSE_HEADERS = `/*
  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/sw.js
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

// Dev mode relies on inline scripts for hot reload, so the policy is only added to production builds.
// The meta tag protects any static host; the _headers file is read by Cloudflare.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'zenpad-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: RESPONSE_HEADERS })
    },
  }
}

export default defineConfig({
  build: {
    // Vite inlines small files as data: URLs, which font-src 'self' blocks, so fonts are always emitted as files.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Zenpad',
        short_name: 'Zenpad',
        description: 'A calm, beautiful place to write. Save reusable text as @snippets. Everything stays in your browser.',
        theme_color: '#2b4470',
        background_color: '#f7f5f0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
