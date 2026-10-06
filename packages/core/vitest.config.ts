/*
  Author: Runor Ewhro
  Description: Runs the calculation core tests standalone from this package,
               resolving the internal @core alias without the app toolchain.
*/

import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src'),
    },
  },
})
