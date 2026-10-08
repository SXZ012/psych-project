import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../frontend/terminal-web/package.json', import.meta.url))
const { build } = require('esbuild')
await build({entryPoints:[fileURLToPath(new URL('./export-report-pdf.ts',import.meta.url))],outfile:fileURLToPath(new URL('../backend/app/services/pdf/report-kit.mjs',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node18'})
console.log('PDF mapping built from shared report-kit')
