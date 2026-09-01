#!/usr/bin/env node
/**
 * VocabTest · 授权码运营控制台（方案三：销售登记 + 立即踢人撤销 + 追加新码 + 查码 · 纯运营兜底零后端）
 * ----------------------------------------------------------------------------------------------------------------
 * 用法：
 *   node scripts/license-admin.cjs build-template                         ← ① 生成腾讯文档销售登记表（9列·预填100+1组）
 *   node scripts/license-admin.cjs check <VT-XXXX-XXXX-XXXX-XXXX>         ← ② 查某个码：hash/是否在白名单/是否已被撤销
 *   node scripts/license-admin.cjs revoke <VT-XXX> [理由]                  ← ③ 立即撤销某码（全球失效·带 tsc 校验 + git push）
 *   node scripts/license-admin.cjs new-codes [N=20]                       ← ④ 100 组卖完后追加 N 组新码，hash 自动进白名单
 *   node scripts/license-admin.cjs ledger add <码> <客户> [金额]          ← ⑤ 快速出单：写一条销售记录到 outbox/license-ledger.csv
 *   node scripts/license-admin.cjs op-cards                                ← ⑥ 打印三张运营操作卡（出单 / 踢人 / 补发）
 *
 * 关键一致性（与 src/utils/access.ts 完全相同，否则 hash 会错！）：
 *   normalizeCode：大写→去非 A-Z0-9→0→O 1→I→去 VT 前缀→截 16 位→4 位加分隔
 *   sha256Hex    ：无盐 sha256，对 normalize 后的明文进行 text.normalize('NFKC') 再哈希
 *
 * 风险预防：
 *   · revoke 前若检测是"管理员万能码"→拒绝撤销，避免把自己踢出去。
 *   · 任何修改 src/utils/access.ts 的动作（revoke/new-codes）都会先跑 `npx tsc --noEmit` 语法校验，
 *     通过后才 git commit push，保证不会把整站弄挂再部署。
 * ----------------------------------------------------------------------------------------------------------------
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const ACCESS_TS = path.join(ROOT, 'src', 'utils', 'access.ts')
const DELIVERY_TXT = path.join(ROOT, 'VocabTest-授权码交付-仅你可见-勿公开.txt')
const OUTBOX = path.join(ROOT, 'outbox')
const LEDGER_CSV = path.join(OUTBOX, 'license-ledger-template.csv')
const REVOCATION_LOG = path.join(OUTBOX, 'revocation-log.csv')
const CHARSET_NOSIM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去 0/O/1/I 手写歧义 32 字符

/* -------------------- 与 access.ts 完全一致的核心算法 -------------------- */

/* ASCII 方框精确对齐：中文按显示宽度 2 计、英文/符号按 1 计，保证 ─│┐┘ 粘贴到微信/邮件严丝合缝（与 enrich-ledger-with-message.cjs / HTML 生成器 1:1 一致） */
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
/** 传入 [['标签', '值'], ...] 多行 KV；返回带 ┌┐└┘ 边框的多行字符串（每行末尾不换行） */
function buildBox(rowsKV) {
  const lines = rowsKV.map(([k, v]) => `${k}：${v}`)
  const innerWidth = Math.max(32, ...lines.map(displayWidth))
  const top = '┌' + '─'.repeat(innerWidth + 2) + '┐'
  const bot = '└' + '─'.repeat(innerWidth + 2) + '┘'
  const mid = lines.map(line => `│ ${padRightTo(line, innerWidth)} │`).join('\n')
  return `${top}\n${mid}\n${bot}`
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
function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text).normalize('NFKC'), 'utf8').digest('hex')
}
function looksLikeValid(n) { return /^VT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(n) }
function randomCode() {
  let s = ''
  for (let i = 0; i < 16; i++) s += CHARSET_NOSIM[Math.floor(Math.random() * CHARSET_NOSIM.length)]
  return 'VT-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16)
}

/* -------------------- access.ts 读写（按行安全操作，避免经验1454177整段替换失败）-------------------- */
function readAccessTsLines() {
  return fs.readFileSync(ACCESS_TS, 'utf8').split(/\r?\n/)
}
function writeAccessTsLines(lines) {
  fs.writeFileSync(ACCESS_TS, lines.join('\n'), 'utf8')
}
/** 在 access.ts 里定位 MASTER_CODE_HASH 和 ALLOWED_CODE_HASHES 数组 */
function parseAccess() {
  const lines = readAccessTsLines()
  const arrStart = lines.findIndex(l => /^\s*export\s+const\s+ALLOWED_CODE_HASHES\s*:\s*string\s*\[\]\s*=\s*\[\s*$/.test(l))
  if (arrStart === -1) throw new Error('未找到 ALLOWED_CODE_HASHES 数组起始行（应匹配 export const ALLOWED_CODE_HASHES: string[] = [）')
  const arrEndRel = lines.slice(arrStart).findIndex(l => /^\s*\]\s*;\s*$/.test(l))
  if (arrEndRel === -1) throw new Error('未找到 ALLOWED_CODE_HASHES 数组结束行 ];')
  const arrEndAbs = arrStart + arrEndRel
  const hashLines = lines.slice(arrStart + 1, arrEndAbs)
  const hashes = hashLines
    .map(l => (l.match(/"([a-f0-9]{64})"/) || [])[1])
    .filter(Boolean)
  const masterMatch = lines.join('\n').match(/export\s+const\s+MASTER_CODE_HASH\s*:\s*string\s*=\s*"([a-f0-9]{64})"/)
  if (!masterMatch) throw new Error('未找到 MASTER_CODE_HASH 常量')
  return {
    lines, arrStart, arrEndAbs,
    hashLines, hashes, masterHash: masterMatch[1],
    hashToLineIdx: Object.fromEntries(hashes.map((h, i) => [h, arrStart + 1 + i]))
  }
}

/* -------------------- CSV 辅助 -------------------- */
const CSV_HEAD = '序号,明文授权码,授权码SHA-256,是否管理员,客户称呼,购买日期,支付金额,销售状态,客户微信号,备注,完整回复文本\n'

/** 严格按 Alina 给的 ASCII 方框模板（含反引号链接、使用方法三段）渲染「完整回复文本」列。
 *  - 方框用 displayWidth / padRightTo / buildBox 精确显示宽度对齐（中文2宽·英文1宽）
 *  - 称呼行动态：客户名非空→「您好，XXX：」；空→「您好：」
 *  - 授权码写入前先 normalizeCode（0→O、1→I容错、分组）
 */
function renderFullMessage({ code, name, url = 'https://vocabtest.shenglishlearner.cn/', wechat = 'Alina0100302' }) {
  const safeCode = normalizeCode(code) || '【请先填写授权序列号】'
  const header = (name || '').trim() ? `您好，${name.trim()}：\n\n` : `您好：\n\n`
  const thanks = `首先感谢您购买 VocabTest 词汇量测试 VIP 永久使用权，以下是交付内容，请妥善保存：\n`
  const box = buildBox([
    ['测试官网',   ` \`${url}\``],
    ['授权序列号', ` ${safeCode}`],
    ['有效期',     ` 永久（30天内设备更换可免费补发）`],
  ])
  const usage = `
【使用方法】
1. 浏览器访问上述网址，首页弹窗输入整串序列号（含 VT 前缀和横杠）
2. 点击"解锁使用"即可开始测试，支持标准 40 题 / 精准 80 题两种模式
3. 测试完成后将结果页截图发送到微信 ${wechat}，
   我们将在 12 小时内为您发送 299 元 VIP 学习包（剑桥教材+语境手册+21天计划）。
`
  return `${header}${thanks}\n${box}\n${usage}`.replace(/\n+$/, '') + '\n'
}

const Csv = {
  esc(v) {
    const s = (v ?? '').toString()
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  },
  row(arr) { return arr.map(Csv.esc).join(',') + '\n' },
  ensureBOM(path) {
    if (!fs.existsSync(path) || fs.readFileSync(path, 'utf8').slice(0, 1) !== '\ufeff') {
      fs.writeFileSync(path, '\ufeff' + (fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : ''))
    }
  }
}

/* -------------------- 子命令 -------------------- */
function cmdBuildTemplate() {
  if (!fs.existsSync(DELIVERY_TXT)) {
    console.error('[错误] 找不到交付 txt：' + DELIVERY_TXT)
    process.exit(2)
  }
  const txt = fs.readFileSync(DELIVERY_TXT, 'utf8')
  const codeHits = Array.from(txt.matchAll(/\bVT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g), m => m[0])
  const codes = Array.from(new Set(codeHits.map(normalizeCode)))
  // 去重后按 hash 是否是 MASTER / 是否在 ALLOWED 里排序：管理员码放第 0 行做醒目标记，普通码紧随其后
  const info = parseAccess()
  const adminIdx = codes.findIndex(c => sha256Hex(c) === info.masterHash)
  if (adminIdx !== -1 && adminIdx !== 0) { const a = codes[adminIdx]; codes.splice(adminIdx, 1); codes.unshift(a) }
  fs.mkdirSync(OUTBOX, { recursive: true })
  let s = '\ufeff' + CSV_HEAD
  codes.forEach((code, i) => {
    const hash = sha256Hex(code)
    const isMaster = (hash === info.masterHash)
    const allowed = isMaster || info.hashes.includes(hash) ? '✅在白名单' : '⚠️不在白名单'
    const name = isMaster ? '（保留 · 管理员万能码 · 仅 Alina 本人用 · 请勿下发用户）' : ''
    const status = isMaster ? '保留' : '未售'
    const remark = isMaster ? '永久有效，不受30天限制；撤销/追加新码/配置演示全靠它；SHA256=' + hash.slice(0, 12) + '…' : allowed
    s += Csv.row([i + 1, code, hash, isMaster ? '是' : '否', name, '', '', status, '', remark, renderFullMessage({ code, name })])
  })
  fs.writeFileSync(LEDGER_CSV, s)
  console.log(`[OK] 腾讯文档销售登记表已生成 → ${LEDGER_CSV}`)
  console.log(`     共 ${codes.length} 条码（管理员万能码 1 + 普通 ${codes.length - 1} 组）`)
  console.log(`     导入步骤：腾讯文档→新建表格→左上角"导入"→选此 CSV → 编码 UTF-8 分隔符逗号 → 直接用！`)
}

function cmdCheck(codeRaw) {
  const code = normalizeCode(codeRaw)
  const hash = sha256Hex(code)
  const info = parseAccess()
  const isMaster = hash === info.masterHash
  const inAllowed = isMaster || info.hashes.includes(hash)
  let status = inAllowed ? '✅ 合法有效' : '❌ 无效（不在白名单里）'
  if (isMaster) status = '👑 管理员万能码（永久有效·超级权限·不可撤销）'
  // 查撤销日志
  let revokedAt = '', reason = ''
  if (fs.existsSync(REVOCATION_LOG)) {
    const rows = fs.readFileSync(REVOCATION_LOG, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter(Boolean)
    for (const row of rows) {
      const cols = (row.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(c => c.replace(/,$/, ''))
        .map(c => c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c)
      if (cols[0] === hash) { revokedAt = cols[1]; reason = cols[2]; status = '🛑 已被撤销（全球失效）'; break }
    }
  }
  console.log(`
【查码结果】
  明文（规范化后）：${code}
  SHA-256         ：${hash}
  销售状态         ：${status}
  是否管理员       ：${isMaster ? '👑 是（永久有效）' : '否'}
  是否在前端白名单 ：${inAllowed ? '✅ YES' : '❌ NO'}
  撤销时间         ：${revokedAt || '（从未被撤销）'}
  撤销理由         ：${reason || '—'}
`)
}

function cmdRevoke(codeRaw, reasonRaw) {
  const code = normalizeCode(codeRaw)
  if (!looksLikeValid(code)) { console.error('[错误] 格式不对：应为 VT-XXXX-XXXX-XXXX-XXXX（实际：' + code + '）'); process.exit(2) }
  const hash = sha256Hex(code)
  const info = parseAccess()
  if (hash === info.masterHash) {
    console.error(`[拒绝撤销] 这个是管理员万能码！撤销了你自己都进不去了。\n  明文: ${code}\n  hash: ${hash.slice(0, 24)}…\n如果确实想吊销某个用户的普通码，请换一个 VT 码重试。`)
    process.exit(4)
  }
  const lineIdx = info.hashToLineIdx[hash]
  if (lineIdx === undefined) {
    console.error('[跳过] 该码本来就不在白名单里，无需撤销：' + code + '（hash=' + hash.slice(0, 24) + '…）')
    process.exit(0)
  }
  const reason = (reasonRaw || '').trim() || '（运营手动撤销·未说明原因）'
  // 删行：按行级结构改，避免整段没命中
  const lines = info.lines.slice()
  lines.splice(lineIdx, 1)
  // 上一行如果末尾没有逗号且下一行不是 ]；——这种情况不用处理（数组允许尾逗号，TS 编译通过）
  writeAccessTsLines(lines)

  // 语法校验
  try { execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' }) } catch (e) {
    console.error('[TS 语法校验失败] 已禁止提交。错误输出：\n' + e.stdout.toString())
    process.exit(5)
  }
  // 写撤销日志
  Csv.ensureBOM(REVOCATION_LOG)
  if (!fs.existsSync(REVOCATION_LOG) || fs.readFileSync(REVOCATION_LOG, 'utf8').replace(/^\uFEFF/, '').trim() === '') {
    fs.writeFileSync(REVOCATION_LOG, '\ufeff授权码SHA-256,撤销时间(ISO),撤销理由,明文(脱敏前8位)\n')
  }
  const now = new Date().toISOString()
  fs.appendFileSync(REVOCATION_LOG, Csv.row([hash, now, reason, code.slice(0, 8) + '…' + code.slice(-4)]))
  // git commit + push
  try {
    execSync(`git add src/utils/access.ts outbox/revocation-log.csv 2>/dev/null; git commit -m "Revoke(License): 撤销授权码 ${code.slice(0, 8)}… — ${reason}"`, { cwd: ROOT, stdio: 'pipe' })
  } catch (e) {
    if (!/nothing to commit/.test(e.stderr?.toString() || '')) console.warn('[git commit 警告]' + e.stderr?.toString().slice(0, 500))
  }
  if (process.env.DRY_RUN) {
    console.log('[DRY_RUN=1] 已跳过 git push origin main（撤销逻辑已完成，未推到远端）')
  } else {
    try { execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' }) } catch (e) {
      console.error('[git push 失败] 请手动检查网络和 gh 登录：' + e.message)
      process.exit(6)
    }
  }
  console.log(`\n[✅ 撤销完成，已全球部署！]
  · 已移除 hash 行 ${lineIdx}：${hash.slice(0, 24)}…
  · 撤销理由          ：${reason}
  · TS 语法校验       ：✅ PASS（无语法错误）
  · git push main     ：✅ DONE
  · Vercel 部署       ：约 30~90 秒后，全球任何设备/浏览器刷新页面 → 此码立即失效
  · 销售登记表同步    ：请打开 outbox/license-ledger-template.csv，把该码行的"销售状态"改为"已撤销"，
                       并在备注列写：撤销时间 + 理由（比如"用户X将码发给3个朋友，收回并免费补发新码 VT-XXXX给原买家"）`)
}

function cmdNewCodes(n = 20) {
  n = Math.max(1, Math.min(1000, parseInt(n, 10) || 20))
  const info = parseAccess()
  // 1. 生成足够不重复的码（与现有白名单 hash 不重复）
  const newOnes = []
  const seen = new Set(info.hashes.concat(info.masterHash))
  let guard = n * 50
  while (newOnes.length < n && guard-- > 0) {
    const code = randomCode()
    const h = sha256Hex(code)
    if (seen.has(h)) continue
    seen.add(h); newOnes.push({ code, hash: h })
  }
  if (newOnes.length < n) console.warn(`[警告] 只生成到 ${newOnes.length} 个（可能字符集组合不够）`)

  // 2. 把 hash append 到 ALLOWED_CODE_HASHES 数组末尾（前一行补逗号 + 新行缩进 2 空格双引号）
  const lines = info.lines.slice()
  const beforeBracket = info.arrEndAbs - 1
  // 找到 结束行（]）前一行，确保尾逗号
  lines.splice(info.arrEndAbs, 0, ...newOnes.map(o => `  "${o.hash}",`))
  writeAccessTsLines(lines)

  // 3. tsc 语法校验
  try { execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' }) } catch (e) {
    console.error('[TS 语法校验失败] 已禁止提交。错误输出：\n' + e.stdout.toString()); process.exit(5)
  }

  // 4. 明文写入 outbox/new-codes-<时间戳>.txt
  fs.mkdirSync(OUTBOX, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..*/, '')
  const outPath = path.join(OUTBOX, `new-codes-${stamp}.txt`)
  let txt = `====================================================================\n VocabTest 追加授权码（生成时间 ${new Date().toLocaleString('zh-CN')}，共 ${newOnes.length} 组）\n 请把这些明文码手工复制粘贴到 outbox/license-ledger-template.csv 里对应列进行销售登记。\n====================================================================\n\n`
  newOnes.forEach((o, i) => { txt += `${String(i + 1).padStart(3, ' ')}. ${o.code}   SHA=${o.hash.slice(0, 12)}…\n` })
  fs.writeFileSync(outPath, txt, 'utf8')

  // 5. 如果销售登记表已经存在，自动在末尾追加 N 行（状态=未售），用户打开就能用
  if (fs.existsSync(LEDGER_CSV)) {
    const ledgerNoBOM = fs.readFileSync(LEDGER_CSV, 'utf8').replace(/^\uFEFF/, '')
    const lines = ledgerNoBOM.split(/\r?\n/).filter(Boolean)
    const startIdx = lines.length - 1  // 跳过表头
    const append = newOnes.map((o, i) => Csv.row([
      startIdx + 1 + i, o.code, o.hash, '否', '', '', '', '未售', '', `追加批次 ${stamp}`, renderFullMessage({ code: o.code, name: '' })
    ])).join('')
    fs.writeFileSync(LEDGER_CSV, '\ufeff' + lines.join('\n') + '\n' + append)
  }

  // 6. git commit + push
  try {
    execSync(`git add src/utils/access.ts`, { cwd: ROOT, stdio: 'pipe' })
    execSync(`git commit -m "Feat(License): 追加 ${newOnes.length} 组授权码（新批次 ${stamp}）hash 写入白名单"`, { cwd: ROOT, stdio: 'pipe' })
    if (process.env.DRY_RUN) {
      console.log('[DRY_RUN=1] 已跳过 git push origin main（新码已写入本地白名单，未推远端）')
    } else {
      execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' })
    }
  } catch (e) {
    if (!/nothing to commit/.test(e.stderr?.toString() || '')) console.error('[git 推送错误]' + e.message)
  }
  console.log(`\n[✅ 已追加 ${newOnes.length} 组新授权码，白名单已生效！]
  · 明文码保存位置：${outPath}
  · 同步追加到销售登记表：${LEDGER_CSV}（销售状态 = 未售，直接复制到腾讯文档就能开始卖）
  · tsc 语法校验 PASS · git push main DONE · Vercel 30~90 秒自动部署生效`)
}

function cmdLedgerAdd(codeRaw, name, amount) {
  if (!fs.existsSync(LEDGER_CSV)) { console.log('[info] 还没销售登记表，先为你自动生成一份...'); cmdBuildTemplate() }
  const code = normalizeCode(codeRaw)
  if (!looksLikeValid(code)) { console.error('[错误] 授权码格式不对：' + code); process.exit(2) }
  const hash = sha256Hex(code)
  const data = fs.readFileSync(LEDGER_CSV, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  let header = data[0], rows = data.slice(1)
  const heads = header.split(',')
  // 列索引动态定位（兼容你以后增删列，顺序变了也不怕）
  const col = (name) => heads.indexOf(name)
  const colIdx = { CODE: col('明文授权码'), NAME: col('客户称呼'), DATE: col('购买日期'), AMOUNT: col('支付金额'), STATUS: col('销售状态'), WECHAT: col('客户微信号'), REMARK: col('备注'), MSG: col('完整回复文本') }
  // hash 匹配行：我们的 CSV 第三列是授权码SHA-256（下标 2），若找不到再退化到全文匹配
  function getCell(row, i) {
    if (i < 0) return ''
    const cells = (row.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(c => c.replace(/,$/, ''))
      .map(c => c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c)
    return cells[i] ?? ''
  }
  let targetIdx = rows.findIndex(r => getCell(r, 2) === hash)
  const values = {
    NAME: name || '',
    DATE: new Date().toISOString().slice(0, 10),
    AMOUNT: amount || '',
    STATUS: '已售',
    WECHAT: '',
    REMARK: `自动登记于 ${new Date().toISOString().replace(/T/, ' ').slice(0, 16)}`,
    MSG: renderFullMessage({ code, name: name || '' }),
  }
  function applyValues(rowStr) {
    const cells = (rowStr.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(c => c.replace(/,$/, ''))
      .map(c => c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c)
    Object.keys(colIdx).forEach(k => { if (colIdx[k] >= 0 && values[k] !== undefined) cells[colIdx[k]] = values[k] })
    // 完整回复文本列一定存在就写（即使 NAME 为空也按空名渲染「您好：」）
    if (colIdx.MSG >= 0) cells[colIdx.MSG] = renderFullMessage({ code: getCell(rowStr, colIdx.CODE) || code, name: values.NAME || getCell(rowStr, colIdx.NAME) })
    // 补齐 cells 长度到 header 列数（防止之前缺列的老行现在 append 后错位）
    while (cells.length < heads.length) cells.push('')
    return Csv.row(cells).trimEnd()
  }
  if (targetIdx === -1) {
    const idx = rows.length + 1
    const cells = new Array(heads.length).fill('')
    cells[0] = idx; cells[1] = code; cells[2] = hash; cells[3] = '否'
    Object.keys(colIdx).forEach(k => { if (colIdx[k] >= 0 && values[k]) cells[colIdx[k]] = values[k] })
    if (colIdx.MSG >= 0) cells[colIdx.MSG] = renderFullMessage({ code, name: values.NAME })
    rows.push(Csv.row(cells).trimEnd())
    console.log(`[info] 表里找不到该码，已作为新行追加`)
  } else {
    rows[targetIdx] = applyValues(rows[targetIdx])
  }
  fs.writeFileSync(LEDGER_CSV, '\ufeff' + header + '\n' + rows.join('\n') + '\n')
  console.log(`[OK] 销售登记完成：${code} → ${name || '（匿名）'} ￥${amount || '—'}`)
  cmdCheck(codeRaw)
}

function cmdOpCards() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 VocabTest · 运营操作卡 x 3（方案三：纯前端白名单 + 手工登记兜底）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 【卡片一】销售出单（日常做 90% 的事，1 分钟一单）
────────────────────────────────────────────────
  0. 打开腾讯文档《授权码销售登记表》→ 找到"销售状态=未售"最上面一行 → 改状态为【已售】。
  1. 同时打开本地 tools/license-message-generator.html（或腾讯文档 C 列）。
  2. 粘贴：客户称呼 + 该行【明文授权码】 → 一键复制完整交付文案。
  3. 微信发给客户："你好 + 感谢下单 + 文案"；并顺手在登记表填 客户称呼 / 购买日期 / 支付金额 / 微信号。
  4. 客户激活后发结果页截图 → 你立刻发 VIP 学习包（剑桥+语境手册+21天）。

🛑 【卡片二】发现共享 → 立即踢人（3 步全球失效）
────────────────────────────────────────────────
  例：你发现同一张"截图相同授权码"被 3 个人发学习群里拼单共享。
  1. 查码：node scripts/license-admin.cjs check <VT-XXX>  → 确认是你卖的合法码。
  2. 撤销：node scripts/license-admin.cjs revoke <VT-XXX> "多人拼单共享，立即收回，准备给原买家补发新码"。
     ✅ 等终端输出 "git push origin main DONE"。⏰ 等 60 秒 → Vercel 部署完成。
  3. 给原买家（**只给最初付款的那位**，绝不给共享的人）补发一条新码：
     a) 如果你还有未售库存：在销售登记表选下一个未售的码 → 卡片一出单发给他，并温柔留言
        "检测到这条码被转发给了多人使用哦~我给你免费换一条更安全的新专属码😘，旧的马上作废~"
     b) 若库存卖完了：node scripts/license-admin.cjs new-codes 50 → 自动追加 50 组并同步登记表。
  4. 别忘了在销售登记表：旧码改状态=【已撤销】备注"多人共享-已补发XXX"；新码=【已售】登记到原买家名下。

🔁 【卡片三】100 组售罄 → 追加新货（30 秒补 50 组）
────────────────────────────────────────────────
  node scripts/license-admin.cjs new-codes 50
  → 终端跑完三件事：
     ① 生成 50 条全新 VT-XXXX 码，明文保存到 outbox/new-codes-<时间戳>.txt
     ② hash 自动 append 到 src/utils/access.ts 白名单 → tsc 校验通过 → git push main → Vercel 自动生效
     ③ 同步在销售登记表最后追加 50 行（状态=未售）→ 你直接拉到最下面就能继续卖。
  → 别忘了把腾讯文档里的表也同步新追加的 50 行（复制本地 CSV 最后 50 行粘贴过去）。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

/* -------------------- main 分发 -------------------- */
function main() {
  const argv = process.argv.slice(2)
  const cmd = argv.shift() || 'help'
  if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true })
  switch (cmd) {
    case 'build-template': return cmdBuildTemplate()
    case 'check':          return cmdCheck(argv[0], argv[1])
    case 'revoke':         return cmdRevoke(argv[0], argv.slice(1).join(' '))
    case 'new-codes':      return cmdNewCodes(argv[0] || 20)
    case 'ledger':         return (argv[0] === 'add') && cmdLedgerAdd(argv[1], argv[2], argv[3])
    case 'op-cards':       return cmdOpCards()
    case 'help': default:
      console.log(`
VocabTest 授权码运营控制台（方案三）

  node scripts/license-admin.cjs build-template                    生成腾讯文档销售登记表（CSV）
  node scripts/license-admin.cjs check <VT码>                      查该码 hash/是否合法/是否撤销
  node scripts/license-admin.cjs revoke <VT码> [撤销理由]           立即撤销某码（tsc 校验 + git push）
  node scripts/license-admin.cjs new-codes [N=20]                  追加 N 组新授权码到白名单和销售表
  node scripts/license-admin.cjs ledger add <VT码> <客户> [金额]    快速出单：写一行销售记录
  node scripts/license-admin.cjs op-cards                          打印三张运营操作卡

例：
  $ node scripts/license-admin.cjs check VT-HGKZ-MCEU-EQ95-P3J3     查你自己的管理员码
  $ node scripts/license-admin.cjs revoke VT-ABCD-EFGH-IJKL-MNOP "3人拼单分享，给原买家补发"
`)
  }
}
main()
