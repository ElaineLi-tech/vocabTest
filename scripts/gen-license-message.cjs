#!/usr/bin/env node
/**
 * VocabTest · 授权码交付文案批量生成器
 * ------------------------------------------------------------
 *  用法 1（单条，最常用）：
 *    node scripts/gen-license-message.js VT-XXXX-XXXX-XXXX-XXXX [称呼]
 *    → 打印完整交付文案到 stdout，可直接复制 / 管道到 pbcopy：
 *       node scripts/gen-license-message.js VT-ABCD-EFGH-IJKL-MNOP 张同学 | pbcopy
 *
 *  用法 2（批量 CSV → 一堆 txt 文件，每日群发 20+ 单用）：
 *    node scripts/gen-license-message.js --csv orders.csv
 *    → CSV 列：name,code（称呼可留空，code 必须 VT-XXXX-XXXX-XXXX-XXXX）
 *    → 输出到 ./outbox/messages/<序号>-<称呼或空>.txt
 *
 *  用法 3（批量 CSV → 合并为一张 outbox/batch.csv，列：name,code,message）：
 *    node scripts/gen-license-message.js --csv orders.csv --mode csv
 *
 *  可通过环境变量改默认值（否则使用你模板里的固定值）：
 *    VT_URL=https://vocabtest.shenglishlearner.cn/
 *    VT_WECHAT=Alina0100302
 * ------------------------------------------------------------
 */

const fs = require('fs')
const path = require('path')

const CFG = {
  url: process.env.VT_URL || 'https://vocabtest.shenglishlearner.cn/',
  wechat: process.env.VT_WECHAT || 'Alina0100302',
}

/* ---------- 核心对齐/格式化工具（与 HTML 版完全一致，保证结果同形）---------- */
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
function buildBox(rowsKV) {
  const lines = rowsKV.map(([k, v]) => `${k}：${v}`)
  const innerWidth = Math.max(32, ...lines.map(displayWidth))
  const top = '┌' + '─'.repeat(innerWidth + 2) + '┐'
  const bot = '└' + '─'.repeat(innerWidth + 2) + '┘'
  const mid = lines.map(line => `│ ${padRightTo(line, innerWidth)} │`).join('\n')
  return `${top}\n${mid}\n${bot}`
}

const CODE_RE = /^VT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
function normalizeCode(raw) {
  let s = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.startsWith('VTVT')) s = s.slice(2)
  if (!s.startsWith('VT')) s = 'VT' + s
  if (s.length >= 2 + 4*4) s = s.slice(0, 2 + 4*4)
  const parts = [s.slice(0,2), s.slice(2,6), s.slice(6,10), s.slice(10,14), s.slice(14,18)]
  return parts.filter(Boolean).join('-')
}

function renderMessage({ name, code, url = CFG.url, wechat = CFG.wechat }) {
  const header = name ? `您好，${name}：\n\n` : `您好：\n\n`
  const thanks =
`首先感谢您购买 VocabTest 词汇量测试 VIP 永久使用权，以下是交付内容，请妥善保存：
`
  const box = buildBox([
    ['测试官网',   ` \`${url}\``],
    ['授权序列号', ` ${code || '【请先输入授权序列号】'}`],
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
  return `${header}${thanks}\n${box}\n${usage}`
}

/* ---------- CSV 解析（极简实现，只支持两列 name,code，双引号容灾）---------- */
function parseCSV(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(Boolean)
  if (!lines.length) return []
  const head = lines.shift().split(',').map(s => s.trim().toLowerCase())
  const iName = Math.max(0, head.findIndex(h => /name|称呼|客户/.test(h)))
  const iCode = Math.max(0, head.findIndex(h => /code|序列号|授权/.test(h)))
  return lines.map(line => {
    const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []
    const cells = cols.slice(0, Math.max(iName, iCode) + 1).map(c => {
      c = c.replace(/,$/, '').trim()
      if (c.startsWith('"') && c.endsWith('"')) c = c.slice(1, -1).replace(/""/g, '"')
      return c
    })
    return { name: cells[iName] || '', code: normalizeCode(cells[iCode] || '') }
  }).filter(r => r.code)
}

/* ---------- 主入口 ---------- */
function main() {
  const args = process.argv.slice(2)
  if (!args.length) {
    console.log(`
VocabTest 授权码交付文案生成器

用法 1（单条 → 直接复制）：
  node scripts/gen-license-message.js <授权码> [称呼]
  例：node scripts/gen-license-message.js VT-ABCD-EFGH-IJKL-MNOP 张同学
  macOS 一键复制：上面命令后面加  | pbcopy

用法 2（批量 CSV）：
  node scripts/gen-license-message.js --csv orders.csv [--mode txt|csv]
    · orders.csv 第一行表头写：name,code（或 称呼,授权序列号）
    · --mode 默认 txt（每个客户一个 txt 文件在 outbox/messages/）
    · --mode csv（合并输出 outbox/batch.csv 方便导入群发工具）

默认值可用环境变量覆盖（不改就用模板原值）：
  VT_URL=https://vocabtest.shenglishlearner.cn/   VT_WECHAT=Alina0100302
`.trim() + '\n')
    process.exit(0)
  }

  /* —— 模式 A：单条 —— */
  if (args[0] !== '--csv') {
    const code = normalizeCode(args[0])
    if (!CODE_RE.test(code)) {
      console.error('[错误] 授权码格式不正确。应为 VT-XXXX-XXXX-XXXX-XXXX（当前：' + code + '）')
      process.exit(2)
    }
    const name = args[1]?.trim() || ''
    process.stdout.write(renderMessage({ name, code, ...CFG }))
    return
  }

  /* —— 模式 B：批量 CSV —— */
  const csvPath = args[1]
  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error('[错误] 未找到 CSV 文件：' + csvPath)
    process.exit(2)
  }
  const mode = (args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'txt').toLowerCase()
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
  const invalid = rows.filter(r => !CODE_RE.test(r.code))
  if (invalid.length) {
    console.error('[警告] 以下行的授权码格式错误，已跳过：\n'
      + invalid.map(r => `  · name=${r.name || '(空)'}  code=${r.code}`).join('\n'))
  }
  const ok = rows.filter(r => CODE_RE.test(r.code))
  if (!ok.length) { console.error('[错误] 没有合法授权码。'); process.exit(2) }

  const outDir = path.resolve(process.cwd(), 'outbox')
  if (mode === 'csv') {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const out = path.join(outDir, 'batch.csv')
    const header = 'name,code,message\n'
    const lines = ok.map(r => {
      const msg = renderMessage({ name: r.name, code: r.code, ...CFG })
        .replace(/"/g, '""').replace(/\n/g, '\r\n')
      return `"${r.name.replace(/"/g, '""')}","${r.code}","${msg}"`
    })
    fs.writeFileSync(out, '\ufeff' + header + lines.join('\n') + '\n', 'utf8')
    console.log(`[OK] 共 ${ok.length} 条 → 已导出到：${out}（含 UTF-8 BOM，Excel 打开不乱码）`)
  } else {
    const dir = path.join(outDir, 'messages')
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    ok.forEach((r, i) => {
      const safe = (r.name || '').replace(/[\\/:*?"<>|]/g, '_')
      const fn = `${String(i + 1).padStart(3, '0')}${safe ? '-' + safe : ''}.txt`
      fs.writeFileSync(path.join(dir, fn),
        renderMessage({ name: r.name, code: r.code, ...CFG }), 'utf8')
    })
    console.log(`[OK] 共 ${ok.length} 条 → 每个客户单独 txt 已生成：${dir}/\n直接用微信/QQ 发送对应 txt 或 Ctrl+C 复制内容即可。`)
  }
}

main()
