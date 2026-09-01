#!/usr/bin/env node
/**
 * 给 outbox/license-ledger-template.csv 每行最后追加一列「完整回复文本」
 *   · 严格按 Alina 给的模板（含 ASCII 方框、反引号链接、使用方法三段）
 *   · 自动替换 {{LICENSE_CODE}} 为该行明文授权码（含 normalize 视觉容错）
 *   · 方框按中文 2 宽 / 英文 1 宽 精确显示宽度对齐 → 粘贴到微信 / 邮件里 ─│┐┘ 严丝合缝
 *   · 多行单元格 CSV 兼容（腾讯文档/飞书/Excel 导入后"完整回复文本"就是一整块，复制即发）
 *
 * 用法：
 *   node scripts/enrich-ledger-with-message.cjs                         ← 覆盖写回 outbox/license-ledger-template.csv
 *   node scripts/enrich-ledger-with-message.cjs --input a.csv --output b.csv  ← 自定义输入输出
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
let INPUT  = path.join(ROOT, 'outbox', 'license-ledger-template.csv')
let OUTPUT = INPUT

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--input')  INPUT  = argv[++i] || INPUT
  if (argv[i] === '--output') OUTPUT = argv[++i] || OUTPUT
}
if (!fs.existsSync(INPUT)) { console.error('[错误] 输入 CSV 不存在：' + INPUT + '（先跑 node scripts/license-admin.cjs build-template）'); process.exit(2) }

/* -------------------- 核心算法（与之前 HTML/Node 脚本完全一致，保证方框视觉 1:1）-------------------- */
const CJK = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/
function displayWidth(str) {
  let w = 0
  for (const ch of (str ?? '')) w += CJK.test(ch) ? 2 : 1
  return w
}
function padRightTo(str, width) {
  const need = width - displayWidth(str)
  return str + (need > 0 ? ' '.repeat(need) : '')
}
function normalizeCode(raw) {
  if (!raw) return ''
  let s = String(raw).trim().toUpperCase()
  s = s.replace(/[^A-Z0-9]+/g, '')
  if (!s) return ''
  s = s.replace(/0/g, 'O').replace(/1/g, 'I')
  let body = s.startsWith('VT') ? s.slice(2) : s
  if (body.length > 16) body = body.slice(0, 16)
  if (!body) return ''
  const groups = []
  for (let i = 0; i < body.length; i += 4) groups.push(body.slice(i, i + 4))
  return 'VT-' + groups.join('-')
}

/** 精确 ASCII 方框包裹 */
function buildBox(rowsKV) {
  const lines = rowsKV.map(([k, v]) => `${k}：${v}`)
  const innerWidth = Math.max(55, ...lines.map(displayWidth))
  const top = '┌' + '─'.repeat(innerWidth + 2) + '┐'
  const bot = '└' + '─'.repeat(innerWidth + 2) + '┘'
  const mid = lines.map(line => `│ ${padRightTo(line, innerWidth)} │`).join('\n')
  return `${top}\n${mid}\n${bot}`
}

/** 用户给的模板原样拼接（反引号保留；称呼行按客户名动态） */
function renderMessage({ code, name, url = 'https://vocabtest.shenglishlearner.cn/', wechat = 'Alina0100302' }) {
  const safeCode = normalizeCode(code) || '【请先填写授权序列号】'
  const header = (name || '').trim() ? `您好，${name.trim()}：\n\n` : `您好：\n\n`
  const thanks =
`首先感谢您购买 VocabTest 词汇量测试 VIP 永久使用权，以下是交付内容，请妥善保存：
`
  // 用户模板 3 行 KV（严格保留反引号）
  const box = buildBox([
    ['测试官网',   ` \`${url}\``],
    ['授权序列号', ` ${safeCode}`],
    ['有效期',     ` 永久（30天内设备更换可免费补发）`],
  ])
  const usage =
`
【使用方法】
1. 浏览器访问上述网址，首页弹窗输入整串序列号（含 VT 前缀和横杠）
2. 点击"解锁使用"即可开始测试，支持标准 40 题 / 精准 80 题两种模式
3. 测试完成后将结果页截图发送到微信 ${wechat}，
   我们将在 12 小时内为您发送 299 元 VIP 学习包（剑桥教材+语境手册+21天计划）。
`
  return `${header}${thanks}\n${box}\n${usage}`.replace(/\n+$/,'') + '\n'
}

/* -------------------- CSV 解析/写出（多行单元格安全：双引号包裹 + 内部 " → "" + 保留 \n）-------------------- */
function parseCSV(text) {
  // 支持双引号内含逗号/换行的标准 CSV（RFC 4180 子集），足够我们自己生成的表
  const rows = []
  let row = [], cell = '', inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (inQuote) {
      if (c === '"') { if (n === '"') { cell += '"'; i++ } else inQuote = false }
      else cell += c
    } else {
      if (c === '"') inQuote = true
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else cell += c
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
}
function csvEscapeCell(v) {
  const s = (v ?? '').toString()
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/* -------------------- 主逻辑 -------------------- */
const rawCSV = fs.readFileSync(INPUT, 'utf8').replace(/^\uFEFF/, '')
const rows = parseCSV(rawCSV)
if (!rows.length) { console.error('[错误] CSV 为空'); process.exit(2) }

const header = rows[0]
/* 列索引定位（兼容你以后可能改表头顺序）：
 *  0 序号  1 明文授权码  2 SHA  3 是否管理员  4 客户称呼  5 购买日期  6 支付金额  7 销售状态  8 客户微信号  9 备注 */
const COL = {
  CODE: header.findIndex(h => h === '明文授权码'),
  NAME: header.findIndex(h => h === '客户称呼'),
}
header.push('完整回复文本')
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  while (r.length < header.length - 1) r.push('')
  const code = COL.CODE >= 0 ? r[COL.CODE] : ''
  const name = COL.NAME >= 0 ? r[COL.NAME] : ''
  r.push(renderMessage({ code, name }))
}

const csvBody = rows.map(r => r.map(csvEscapeCell).join(',')).join('\n') + '\n'
fs.writeFileSync(OUTPUT, '\ufeff' + csvBody, 'utf8')

/* -------------------- 控制台给用户做个肉眼 QA 样本 -------------------- */
const sampleRows = [1, 2, 15]
console.log(`[OK] 已追加「完整回复文本」列 → ${OUTPUT}
总行数 = ${rows.length}（表头 + ${rows.length - 1} 条码）
新增列名 = ${header[header.length - 1]}

———————————————— QA 样本（第 1 / 2 / 15 行肉眼验框）————————————————`)
sampleRows.forEach((idx) => {
  if (!rows[idx]) return
  const r = rows[idx]
  const msg = r[r.length - 1].split('\n')
  // 消息结构索引定位：从 msg 里找 ┌（上框第一行），然后它的 +0/+1/+2/+3/+4 行分别对应 上框/链接行/码行/有效期行/下框
  const bi = msg.findIndex(l => l.startsWith('┌'))
  if (bi === -1) { console.log(`  ⚠️ 第 ${idx + 1} 行消息里找不到方框 ┌，跳过校验`); return }
  const [upLine, urlLine, codeLine, lifeLine, dnLine] = [msg[bi], msg[bi+1], msg[bi+2], msg[bi+3], msg[bi+4]]
  const width = upLine.length - 2  // ┌ 和 ┐ 不算
  const boxCheck = (label, line, lastCh, expectedWidth) => {
    const padded = line.padEnd(expectedWidth)
    return `  ${label}=${displayWidth(line) >= 5 ? (padded.slice(-4)) : (line.length + '宽')} │ 末端字符=${JSON.stringify(line.trimEnd().slice(-1))} ${/│$/.test(line.trimEnd()) && lastCh === '│' ? '✅' : (line.endsWith(lastCh) ? '✅' : '❌ 错位')}  总宽=${line.length}/${expectedWidth}`
  }
  console.log(`
[第 ${idx + 1} 行 · 码=${r[COL.CODE]} · 客户=${r[COL.NAME] || '(空)'}]
${'─'.repeat(72)}
  ${upLine}
  ${urlLine}
  ${codeLine}
  ${lifeLine}
  ${dnLine}
${'─'.repeat(72)}
  方框精确对齐校验（内净宽=${width}）：
    · 上框 ─ 字符数 = ${upLine.length - 2}
    · 下框 ─ 字符数 = ${dnLine.length - 2}  ${upLine.length === dnLine.length ? '✅ 上下一致' : '❌ 上下不一致'}
    · 链接行尾字符 = ${JSON.stringify(urlLine.trimEnd().slice(-1))} ${/│$/.test(urlLine.trimEnd()) ? '✅ │' : '❌ 错位'}
    · 码行尾字符   = ${JSON.stringify(codeLine.trimEnd().slice(-1))} ${/│$/.test(codeLine.trimEnd()) ? '✅ │' : '❌ 错位'}
    · 有效期尾字符 = ${JSON.stringify(lifeLine.trimEnd().slice(-1))} ${/│$/.test(lifeLine.trimEnd()) ? '✅ │' : '❌ 错位'}
`)
})
console.log(`
💡 下一步：
  ① 腾讯文档→打开你之前的销售登记表→右上角「导入覆盖」选择这个 CSV→完成。
  ② 每天出单直接"复制该单元格"（完整回复文本这列）→粘贴给客户，
     方框/换行/反引号链接/序列号 100% 到位，连 HTML 生成器都不用开了！
`)
