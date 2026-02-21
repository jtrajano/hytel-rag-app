import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const functionsPkgPath = resolve(process.cwd(), 'apps/functions/package.json')
const pkg = JSON.parse(readFileSync(functionsPkgPath, 'utf8'))

if (!pkg.dependencies || !pkg.dependencies['@repo/shared']) {
  console.error('Missing @repo/shared in apps/functions/package.json dependencies')
  process.exit(1)
}

pkg.dependencies['@repo/shared'] = 'file:./vendor/shared'
writeFileSync(functionsPkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log('Prepared apps/functions/package.json for Firebase deploy (@repo/shared -> file:./vendor/shared)')
