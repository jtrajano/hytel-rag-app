import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const functionsDir = resolve(process.cwd())
const repoRoot = resolve(functionsDir, '../..')
const sharedDist = resolve(repoRoot, 'packages/shared/dist')
const vendorShared = resolve(functionsDir, 'vendor/shared')
const vendorDist = resolve(vendorShared, 'dist')

if (!existsSync(sharedDist)) {
  console.error('Missing packages/shared/dist. Run @repo/shared build first.')
  process.exit(1)
}

rmSync(vendorShared, { recursive: true, force: true })
mkdirSync(vendorDist, { recursive: true })
cpSync(sharedDist, vendorDist, { recursive: true })

const vendorPkg = {
  name: '@repo/shared',
  version: '0.0.0-local',
  type: 'commonjs',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: {
    '.': {
      types: './dist/index.d.ts',
      default: './dist/index.js',
    },
    './schemas': {
      types: './dist/schemas/index.d.ts',
      default: './dist/schemas/index.js',
    },
  },
}

writeFileSync(resolve(vendorShared, 'package.json'), `${JSON.stringify(vendorPkg, null, 2)}\n`)
console.log('Prepared apps/functions/vendor/shared from packages/shared/dist')
