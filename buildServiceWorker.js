/**
 * buildServiceWorker.js — Vite plugin that generates `sw.js` at build time.
 *
 * WHY generate instead of hand-writing: the build emits content-hashed asset
 * filenames (index-<hash>.js/css, suab-logo-<hash>.png). A hand-written
 * precache list would go stale on every build; generating the manifest from
 * the final bundle output keeps the precache exact.
 *
 * What the generated service worker does:
 *   - precaches every build asset + index.html + manifest + icons
 *   - app shell (navigation requests): network-first, cache fallback —
 *     fresh when online, still opens offline
 *   - same-origin static assets: cache-first (immutable hashed files)
 *   - API calls (/api/…): network-only, never cached
 *   - everything else: network with cache fallback
 *
 * The plugin is a no-op in dev (dev server never registers a SW).
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const VERSION = 'suab-pwa-v1'

export function buildServiceWorker() {
  let resolvedBase = '/'
  return {
    name: 'suab-build-service-worker',
    apply: 'build', // production builds only
    configResolved(config) {
      // Capture the real base ('/Suab-deploy/') — options.base is not
      // populated at writeBundle time.
      resolvedBase = config.base ?? '/'
    },
    writeBundle(options, bundle) {
      const outDir = options.dir ?? 'dist'
      const base = resolvedBase

      // Collect every emitted asset (hashed js/css/images) for precaching.
      const assets = Object.keys(bundle)
        .filter((name) => bundle[name].type === 'asset')
        .map((name) => base + name.split('/').pop())

      const precache = [
        base, // index.html (app shell)
        base + 'manifest.webmanifest',
        ...assets,
      ]

      const sw = `/*
 * Suab service worker — generated at build time by buildServiceWorker.js.
 * Precaches the app shell + hashed build assets; safe to regenerate.
 */
const VERSION = '${VERSION}'
const PRECACHE = ${JSON.stringify(precache, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never intercept API traffic — the sync bridge handles its own failures.
  if (url.pathname.includes('/api/')) return

  // App shell: network-first so updates land, cache fallback for offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(base, copy))
          return response
        })
        .catch(() => caches.match(base)),
    )
    return
  }

  // Same-origin static assets: cache-first (hashed filenames are immutable).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(VERSION).then((cache) => cache.put(request, copy)
              )
            }
            return response
          }),
      ),
    )
    return
  }

  // Cross-origin GETs: network with cache fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => put(cache, request, copy))
        }
        return response
      })
      .catch(() => caches.match(request)),
  )
})

function put(cache, request, response) {
  return cache.put(request, response)
}
`
      writeFileSync(resolve(outDir, 'sw.js'), sw)
    },
  }
}
