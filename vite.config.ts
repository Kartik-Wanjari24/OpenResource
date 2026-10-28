/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

function expressPlugin(): Plugin {
  return {
    name: 'express-backend',
    configureServer(server) {
      process.env.VITE_DEV_SERVER = 'true'
      let appInstance: any = null
      const loadApp = import('./server/index.ts')
        .then(({ default: app }) => {
          appInstance = app
          return app
        })
        .catch((err) => {
          console.error('Failed to load express dev server:', err)
        })

      // Register middleware synchronously before Vite's internal SPA HTML fallback
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url.startsWith('/api') || req.url === '/health')) {
          if (appInstance) {
            return appInstance(req, res, next)
          }
          loadApp
            .then((app) => {
              if (app) (app as any)(req, res, next)
              else next()
            })
            .catch(next)
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), expressPlugin()],
  test: {
    globals: true,
    environment: 'node',
    // Unit & API tests use in-memory mode by default to protect development database records from resetStore()
    env: {
      STORAGE_MODE: 'memory',
    },
    // Prevent cross-file database concurrency deadlocks
    fileParallelism: false,
    testTimeout: 10000,
  },
})
