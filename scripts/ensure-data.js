/** `predev` / `prebuild` hook：若 src/data/levels/L1.json 不存在则自动调用 build-word-data.js */
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'src', 'data', 'levels', 'L1.json')

if (!existsSync(OUT)) {
  console.log('🗂️  初次启动，开始预处理词库…')
  const { spawnSync } = await import('node:child_process')
  const res = spawnSync('node', [join(__dirname, 'build-word-data.js')], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}
