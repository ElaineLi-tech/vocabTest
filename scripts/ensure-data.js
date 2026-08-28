/** `predev` / `prebuild` hook：若 src/data/levels/L1.json 不存在则自动调用 build-word-data.js；
 *  构建/启动前把 10 档 JSON + index.json 同步到 public/data/levels/，
 *  这样 Vite build 会原样把它们搬到 dist/data/levels/，
 *  浏览器运行时用 fetch('/data/levels/L4.json') 懒加载，避免把 26MB JSON 打包进 JS 造成 Node/Vite OOM/Abort。
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(__dirname, '..', 'src', 'data', 'levels')
const OUT = join(SRC_DIR, 'L1.json')
const PUB_DIR = resolve(__dirname, '..', 'public', 'data', 'levels')

if (!existsSync(OUT)) {
  console.log('初次启动，开始预处理词库…')
  const { spawnSync } = await import('node:child_process')
  const res = spawnSync('node', [join(__dirname, 'build-word-data.js')], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

// 同步 src/data/levels/*.json + index.json 到 public/data/levels/（mtime 不同才拷贝，避免每次 touch）
mkdirSync(PUB_DIR, { recursive: true })
const srcFiles = readdirSync(SRC_DIR).filter(f => /\.json$/i.test(f))
let copied = 0, skipped = 0
for (const f of srcFiles) {
  const s = join(SRC_DIR, f)
  const t = join(PUB_DIR, basename(f))
  const ss = statSync(s)
  if (existsSync(t)) {
    const ts = statSync(t)
    if (ss.size === ts.size && Math.abs(ss.mtimeMs - ts.mtimeMs) < 1000) { skipped++; continue }
  }
  copyFileSync(s, t)
  copied++
}
console.log(`同步词库 JSON 到 public/data/levels/: +${copied} 个新/改文件，${skipped} 个未变化（共 ${srcFiles.length} 档）`)
