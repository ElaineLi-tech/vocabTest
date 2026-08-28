/**
 * 预处理 english-vocabulary 词库：
 *   - 从 full_line_jsonl/sentence/正序 读取 23 本词书
 *   - 按 10 档归并、去重（word.toLowerCase() 为 key）
 *   - 写出 src/data/levels/L{1..10}.json + index.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC_POS = join(ROOT, 'english-vocabulary', 'full_line_jsonl', 'sentence', '正序')
const OUT_DIR = join(ROOT, 'src', 'data', 'levels')

if (!existsSync(SRC_POS)) {
  console.error('❌ 找不到原始词库路径：', SRC_POS)
  console.error('请先执行：git clone https://github.com/KyleBing/english-vocabulary')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

// L1..L10 映射：{ level -> 中文文件名 }
const LEVEL_BOOKS = {
  1:  { name: '小学入门',          books: ['人教小学三年级', '人教小学四年级', '人教小学五年级', '人教小学六年级'] },
  2:  { name: '初中基础',          books: ['人教初中七年级', '人教初中八年级', '人教初中九年级', '外研社初中', '初中'] },
  3:  { name: '高中基础',          books: ['人教高中', '北师高中', '高中'] },
  4:  { name: 'CET-4 四级',        books: ['四级'] },
  5:  { name: 'CET-6 六级',        books: ['六级'] },
  6:  { name: '考研 / 专四',       books: ['考研', '专四'] },
  7:  { name: '雅思 / GMAT / 商务',books: ['雅思', 'GMAT', '商务英语'] },
  8:  { name: '托福 / 专八',       books: ['托福', '专八'] },
  9:  { name: 'SAT',              books: ['SAT'] },
  10: { name: 'GRE',              books: ['GRE'] },
}

function loadBookJSONL(fileName) {
  const p = join(SRC_POS, fileName + '.jsonl')
  if (!existsSync(p)) return []
  const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
  return lines.map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

/** Compact translation {v: value, p: pos} */
function compactTranslations(trans = []) {
  const out = []
  for (const t of trans) {
    if (!t || !t.translation) continue
    out.push({ v: String(t.translation), p: t.type || '' })
  }
  return out
}
function compactPhrases(ph = [], limit = 5) {
  const out = []
  for (const p of ph) {
    if (!p || !p.phrase) continue
    out.push({ p: String(p.phrase), c: String(p.translation || '') })
    if (out.length >= limit) break
  }
  return out
}
function compactSentences(ss = [], limit = 3) {
  const out = []
  for (const s of ss) {
    if (!s || !s.sentence) continue
    out.push({ e: String(s.sentence), c: String(s.translation || '') })
    if (out.length >= limit) break
  }
  return out
}

const KNOWN_BOOKS = new Set(readdirSync(SRC_POS).map(f => f.replace(/\.jsonl$/, '')))
console.log('📚 已发现正序 sentence JSONL 词书：', [...KNOWN_BOOKS].join('、'))

const indexOut = []
let globalDedup = 0

for (const [levelStr, conf] of Object.entries(LEVEL_BOOKS)) {
  const level = Number(levelStr)
  const dedupMap = new Map()
  for (const bookName of conf.books) {
    if (!KNOWN_BOOKS.has(bookName)) {
      console.warn(`  ⚠️  L${level} 期望词书「${bookName}.jsonl」不存在，跳过`)
      continue
    }
    const entries = loadBookJSONL(bookName)
    for (const raw of entries) {
      if (!raw || typeof raw.word !== 'string') continue
      const key = raw.word.trim().toLowerCase()
      if (!key || dedupMap.has(key)) continue
      const item = {
        w: raw.word.trim(),
        us: raw.us || '',
        uk: raw.uk || '',
        t: compactTranslations(raw.translations || []),
        ph: compactPhrases(raw.phrases || []),
        s: compactSentences(raw.sentences || []),
      }
      if (item.t.length === 0) continue // 没有释义的跳过
      dedupMap.set(key, item)
    }
  }
  const words = [...dedupMap.values()]
  const out = { level, name: conf.name, total: words.length, words }
  const outPath = join(OUT_DIR, `L${level}.json`)
  writeFileSync(outPath, JSON.stringify(out))
  const sizeKB = Math.round((existsSync(outPath) ? statSync(outPath).size : 0) / 1024)
  console.log(`✅ L${level} ${conf.name.padEnd(16)} → ${String(words.length).padStart(6)} 词 (${sizeKB} KB)`)
  globalDedup += words.length
  indexOut.push({ level, name: conf.name, total: words.length, file: `L${level}.json` })
}

indexOut.sort((a, b) => a.level - b.level)
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(indexOut, null, 2))
console.log('\n🎉 去重合计：', globalDedup.toLocaleString(), '词')
console.log('📁 输出目录：', OUT_DIR)

if (globalDedup < 54000) {
  console.warn('⚠️  去重后总词数 < 54,000，请检查原始词库是否完整')
}
