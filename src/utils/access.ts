// 授权码校验（前端轻量防白嫖，详情见 App.tsx <AccessGate/>）。
//
// 注意：纯前端校验无法 100% 防逆向（任何懂 React 调试的人都能改掉 localStorage），
// 但合法 16 位短码 + SHA-256 哈希对比能拦住 99% 的普通用户白嫖。
// 如需真正的一次性 / 不可绕过，请升级到方案 B：Vercel Edge Function + HMAC JWT。

export const ACCESS_GRANTED_KEY = 'vt_access_granted_v1';
export const VALID_DAYS = 30;

/** 与 Node.js sha256 计算对齐的盐：`${salt}${normalize(text)}` */
export const HASH_SALT = 'vocabtest-gate-v1::';

/**
 * 100 组合法售卖授权码的 SHA-256 哈希白名单。
 *
 * 为什么只存哈希不存明文：
 *  - 即使某用户打开 DevTools 反编译 .js 文件，也只能看到 100 个长度 64 的十六进制串，
 *    无法还原成 VT-XXXX-XXXX-XXXX-XXXX 明文；每个合法码的熵约 80 bits，SHA-256 暴力穷举不现实。
 *  - 追加新码时，只需把新生成的明文 sha256(salt + normalize('VT-XXX-...')) → 十六进制 → append 进数组。
 *  - 撤销某码：从数组中移除对应 hash，所有已持久化的 grant 下次 readGrant() 时都会被踢出。
 */
export const ALLOWED_CODE_HASHES: string[] = [
  "833c9f81e0ff8200f5a281549b008fbcdd28f143197126012e66934e93cbafa8",
  "0e06457a3dc51a332bb3aee05b666428dffc94b1d8007005e3a8e2bf6640c898",
  "fd04a842d407cbfeb65f79f3a9209d3f2b42c3c89c34509fa8db8b26b34c5032",
  "e9831e63b4c1fda517a4c89237332a923a46e7b5941308dff62c4bd8702fcbf2",
  "8b66db52c6eaee86389c37c6aa1ba77854922ed3c89a3fc1ef9133be93618773",
  "39ef4ba0cb595dc1156c8ae91f3f52b8b973f1d913fddc664292657624938898",
  "6e40cb049765ed36919962ac54c198705cfc6f9a02f8eebf592191c6e39afaf5",
  "b38f9cce288ddfece3e9e7977a9e0c1407a60ca332ada10e2bb1cb82433e19d6",
  "424e49c94ecd052dbcd5302139e4931f96b4f106512cd8f48da2c40b42ffaa48",
  "2554ec72c11dc7811cb97cbb57d5a871e23825cb3b40728adced6c72194aa3bf",
  "e2b2806e841fbc67d0785ff924bf84b9638a24742c45289a983e4a6e6b5ccc03",
  "946aa1c9f7e1986e31b1be14a6b73856114910c557bf03b5e57b3fe2430cdf2b",
  "8ce222f2635c78b3b43f4a2450794dab91fee0860fce995df137aecd28ceed48",
  "0776351d4d9b200639186a23f361dc8a0b3996a82c57c9481bb4fe900948709b",
  "54541ceb527f715aea303862361992de06997f27e620792628be34e18e4336ff",
  "29f6f662a56fbb4015956d2ac2b50d56fd732c65c6423c4f445c7114364e6d7e",
  "e7e3b6ca62078246d937417a39b0c7268ef62c18a8fb8076cc6362cf9eb432f2",
  "76f7a1661e49f3c814a04522f1510f4cfd16be8b38a7f3aa98488553e9c994d1",
  "dd30de2dea1413d244dfca585c947b850c3b24055ba6f9dea87410793eb1ee72",
  "30cbb4789d9f1470a30e5f0849d1638dc59eccef3618184ecb632d5e9a9f7334",
  "edc2d04ed72e4f68a4955b9ac7f8f2b6d15009b9c7564893481c7366367ad46e",
  "36361937af3806c6a2b6ea6c83e9cde886ff6cc0f3c8326961fa0f97a26d1754",
  "8876e80da51c83ae8623a7f81d842ba2abdd801d1e667ee36dc008d538f0febc",
  "59789f07a5e354fe036cf873889a8c71951ee075c82deafb19109e8268864c1f",
  "7cc2437e7f3042e54250c7df8f8386427a4424ca3417a406aeeb51e93dc4b05d",
  "71340e5a6d0bf5e70300c1fe8c570d7ffbbc7c1788a39c001090f1104c43346c",
  "e51ade43f888a3da16c5d3d2c0e84dca3465b4e7e69eb5f970904b958c5a3a9a",
  "7f65e88dd0ada088819968e613acb96e6b179cdc98936270963a3bbb3ac83b79",
  "a722937ad30fcd17a608007f7b80a3b6fc35fd0f893853d6bf2f3594edb7d184",
  "7802ab0e6043908549d773a75cf1d433299716ff1b9df7429795ebd6ab9873a5",
  "308f6769a306fe7f13747d3dbc31a683eb5fd8483823bba29c33a5c6141fc7fb",
  "892ce0cc1a26cde8602f01d930957ea2234f0fb939f1c609f81d3276d32afff8",
  "46d173a27ea4bb1477717754b7396ca890ad0fdbd826158369395ee4c70bcef2",
  "c7da2333b56d5d03c4efa2e3d2923bd5250febcb148dbd4b0ed717da603197d8",
  "6e45487917f083473d80911e67492e15a2d82f33adef16b581f0e2545b7d8cd4",
  "2ed03fd3de3bf5e3d10d7d3846448b17183a61842dd552f1c522ec292e189e58",
  "b481d1f791c0d9a377e44b89699d6940b7f22a1be55a5f67639838f18081ef9a",
  "f9f34af59bcd890bfa6ce8dbc1da31935b31e8a2c5dda1ec593922097d3a5118",
  "e523a71a441487361e7ea43d90c475670020c0d8cf516a8c9ecf6d33555a923f",
  "9a0e4a63c7441c95451e96f9f2b0eb3bab5334229a251d82834d0161413f9b06",
  "824f37d9f1f7ecbbb1a5d6f30d09527588da96b2196a916b2bd667903d6da2e6",
  "77bb8a4283a6804db09a1dfed5b93795b8d8dc75b6379494114b883fdee4b614",
  "52639f385edc14cbd64dbbbca54fd156a96a14e06194edad184bfed0e1631b42",
  "23b889090b3bcd6dc3559de50f190d31d1b375c51526cde0f0a452e4c91cf752",
  "b2f29103264ebd3545d1e28c7b865a99be05793466a06632edff1e6899fa7d9e",
  "8097fc5de16b497416ff95b1cc86dd480942f2b49c4aac9ead31ab342b65e934",
  "1e0544325c50ead3bfe3d58367c9177e57a5c50d7861845e7a2116a4dbcb2b1c",
  "5adad75d5b06a77257770df9b8492e1dc2451bc7fef715d39cd1ecfb43e73762",
  "f7ac5d1086833d856fb6f26a060ebca56c499d6e156a93800f4d7f71ff9f36d3",
  "c980e5bbce42037f95b8b43d34c20ec4cf2448383715b6a06874ea1191fc59c3",
  "66aad00872010fa0017ecff67b166b800328f9ad4b36a50198f2682d9f6a2e26",
  "d3a89f694bab163f5f4cbf85e20c2c1bbde3f773c8917461a7012a9b6720c77e",
  "e5b756a7dc8fdbb7756104450e5814975b29ef7494366cb625e26afde0e08934",
  "c35c188615081d477ec6da50fb5a6067b923073f768ea7a28061d7fa08721f0c",
  "3f942d3ea40fbcb19545d6b3d392bc7c0152039db0dcffddb92295897538afd1",
  "e436c2ed1c4a97989adfd1c35289746ba57a9502ffa3d1df948888bda53f616b",
  "bd1bddc5bfb0a7ecbd52258ce367f9df46c311dbe7fce878d5ae8038dd27861e",
  "5c1c290e8eafe593a4640678b706bd4b48d5d68d7995a14a6930c3466c21a574",
  "60eb401958a08534aea116fbd31b69c2f6f3ff97884ad7beb5d5c55d8b615107",
  "647155e73ce35cd2f88363d2987fbb416dd3d5321ca3879ead8a1434a7ee6d5a",
  "9e7dd6f8793836b569c050d92693aa79a573ee50b6b9801db3a22ff7cbf0082e",
  "b5e0884d6f1e52c61cda05cc54879f55fdb9ead5f3feaa8328f31dae1f1d6aaa",
  "11cde98b6f44cbfab058a9f3ad80aadbe20604fea912b8b354456f7350441c2b",
  "9d21a67ccfbd6914be997f387ce044022b7a62bd1600e911e6cb2369534d5b6e",
  "7c516fbd0c865222a9023b060808ea16baefed726e578747b00dcb1c1485f28b",
  "661d08f8893597ba5571f0590f744ccfa5a44feb62b4278ceb3255906adec36e",
  "b563d641df0e50017ed66a9ee83206a1788bb1f4d220ba27bd43d2ed5adc99bd",
  "d387b3481b00fd3e6fc9321a7b976d27017c34f557aa1ee45d3b88809ada41fa",
  "afaeac598a8c9f3976f1ae3fd30c9a1e5b26e53f331a854c4c28b0a7b51e3208",
  "005dd8e67340c0cbbc70286c8ab6d4952805745ec53253960e001e615cc7fdd4",
  "1b74133c509606cdc0986818e589f1e5117b4ecf635d8bf03629fc1191c65f89",
  "db4094d9f31326e6271f246257f1ce428534e1e27e6e2e1fe49b680e696dd609",
  "d030d96011019d0f212cfe4797cb783e683e95e663923c2ad3a4d3607174adae",
  "e91715858b3f4820176b541d38b88a167e2dc3ae132164e579f328abbb32f1df",
  "f6cd2a66ee01a8de4ce7cf8796662c36b946f154dcd6bb519aee2b6435330ea6",
  "cce83f278e7f033d21c04019ec8a00be4f95a47b6695cc9d008fbb3c62bb59d0",
  "5a93a2dcc23df436e3d0ebbbaa5c1ec85d78581af97bdb1b010cdec187755041",
  "c4c6cea4bded511ea5cba2b4dc869099f45d51d73346d47803d4a636c4093913",
  "36542903a909fecad034bf9901dce8fef9686b9951e8fe7013039fc136d8e22e",
  "dd4b34212a9fc4d85a1e03fcf23a2a5c000fe5b58d6ce22984a0dd521f95406a",
  "5b80f8a8fa836a6434733fd76bfc5136fd9f9008efc0c55fe865243a4fe3ccda",
  "1e8aa5fe108195cc6713579d51bdce1e4467d4a04dab581de50f0bfb3d615bb4",
  "d220bad6ab130b74d4868612d28b56f1fd69000b7dbbddfc87bab3dcc5471091",
  "150aae8154e0f5843379020713646cd094be9096a36e84129daf8297df2b554d",
  "34f4dedde87c5d5e7b792e843d22684858abffec5340cbf744afc7b1e1337a11",
  "742309a008547b1470413ff16b89c627ca5288d81440488a48161b8624b2845a",
  "8cdcab2c5d535c3788cb70a5241257ae0d86b57c92987249ad80720cb835bf62",
  "0d6677faa6efd45b8bebbd58b0dece96a612f4f405d9d004c8c354405a136822",
  "56493b54d719cc3e2fa2e860653c4fff1fe6f681737fa1003227a8b8660436de",
  "52d19b48587413b4acb22d83787e7a6902add2346280d6ea2efb1f825bf43fce",
  "542ef68b0b7a9c9a6b84b6ca798078154f6d85467a237f1e8b5be8befc3f8bc4",
  "2d0dbde7bcf96ab3ffac552e479ff69e53515b72c78cca75cbc5e162a0b3f84b",
  "019f8c39e202243c3d14ce5a10a075332f78b0a28561b70e097f3d60d1f594bf",
  "838fbdc1f439730334e51769cb566f8f666d29b4686015fbde8421047bdc5a3a",
  "6146fabd6ffa373c2b212890cfdc4c2a69252ec94935b356c5ff7a336077b70a",
  "793217323f95dd315b0495cf7a5993046806bad154aa4e630a8bdc745479b017",
  "25b04704cf8fd2d4e06e230d4b7c9db2dbf4600be72d931a269cc7164f6e05f0",
  "a6a4305c53c3af14b0f4a4231372a44fc4e98df399fcb848313bb4b23fad68ef",
  "6fad6244ca559d06bb0741bcc0f4e67f3b5876582b39aa4926f6e79eda593698",
  "92cfa3c1d6342899a22e4725688d3fa3ce4294b0286907ee0b78828b99005b7d",
];

/** 超级管理员万能码的 SHA-256 哈希（永久有效，不受 VALID_DAYS 限制）。请把明文单独保存（交付清单），不要把明文写进代码。 */
export const MASTER_CODE_HASH: string = "570eb2601a3baae63cf46001165d312b10fe9685d89da86e974a1b91804258c2";

/** 字符集：VT- 前缀 + 4 组 4 字符，共 32 个（去掉 0/O/1/I 手写歧义） */
const NORM_CHAR = 'A-Z2-9';
const RE_CODE_FULL = new RegExp(`^VT-[${NORM_CHAR}]{4}-[${NORM_CHAR}]{4}-[${NORM_CHAR}]{4}-[${NORM_CHAR}]{4}$`);
const RE_CODE_NOHD = new RegExp(`^[${NORM_CHAR}]{4}(-[${NORM_CHAR}]{4}){3}$`);

/**
 * 规范化授权码：
 *  - 全部转大写、去空格
 *  - 把 _ . / \ ／ — – － 、 ， 等常见分隔符全部转 -
 *  - 缺 VT- 前缀自动补
 */
export function normalizeCode(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim().toUpperCase();
  s = s.replace(/\s+/g, '').replace(/[_./\\／—–－、，.]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (RE_CODE_FULL.test(s)) return s;
  if (RE_CODE_NOHD.test(s)) return 'VT-' + s;
  return s;
}

/** 判断格式是否合法（用于 UI 输入时快速报错，减少不必要的 WebCrypto 计算） */
export function looksLikeValidCode(normalized: string): boolean {
  return RE_CODE_FULL.test(normalized);
}

/** 浏览器端 SHA-256 → 64 hex（与 Node `crypto.createHash('sha256').update(salt + text).digest('hex')` 完全一致） */
export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = enc.encode(HASH_SALT + text.normalize('NFKC'));
  const out = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(out);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export interface VerifyResult {
  ok: boolean
  master?: boolean
  reason?: string
  codeHash?: string
}

/** 校验授权码（格式→哈希→白名单比对） */
export async function verifyCode(raw: string): Promise<VerifyResult> {
  const norm = normalizeCode(raw);
  if (!norm) return { ok: false, reason: '请输入授权码' };
  if (!looksLikeValidCode(norm)) return { ok: false, reason: '授权码格式应为 VT-XXXX-XXXX-XXXX-XXXX' };
  const codeHash = await sha256Hex(norm);
  if (codeHash === MASTER_CODE_HASH) return { ok: true, master: true, codeHash };
  if (ALLOWED_CODE_HASHES.includes(codeHash)) return { ok: true, codeHash };
  return { ok: false, reason: '授权码无效，请检查输入；若还没购买请添加微信 Alina0100302 获取' };
}

/** 持久化结构（只存 codeHash，不存明文，防止意外导出 localStorage 泄明文） */
export interface AccessGrant {
  codeHash: string
  master: boolean
  grantedAt: number
  /** master = Infinity，普通用户 30 天后的 ms epoch */
  expiresAt: number
}

export function nowMs(): number { return Date.now(); }

export function persistGrant(res: VerifyResult & { codeHash: string }): AccessGrant {
  const grant: AccessGrant = {
    codeHash: res.codeHash,
    master: !!res.master,
    grantedAt: nowMs(),
    expiresAt: res.master ? Number.POSITIVE_INFINITY : nowMs() + VALID_DAYS * 24 * 3600 * 1000,
  };
  try { localStorage.setItem(ACCESS_GRANTED_KEY, JSON.stringify(grant)); } catch { /* 隐私模式 localStorage 不可用 → 退化为内存态（刷新失效） */ }
  return grant;
}

/** 读取本地授权 + 二次校验（过期自动清 / 若你把 hash 从白名单移除也立即失效） */
export function readGrant(): AccessGrant | null {
  try {
    const raw = localStorage.getItem(ACCESS_GRANTED_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as AccessGrant;
    if (!g || typeof g.codeHash !== 'string') return null;
    if (g.expiresAt !== Number.POSITIVE_INFINITY && typeof g.expiresAt === 'number' && g.expiresAt <= nowMs()) {
      try { localStorage.removeItem(ACCESS_GRANTED_KEY); } catch { /* ignore */ }
      return null;
    }
    const inWhitelist = (g.codeHash === MASTER_CODE_HASH) || ALLOWED_CODE_HASHES.includes(g.codeHash);
    if (!inWhitelist) {
      try { localStorage.removeItem(ACCESS_GRANTED_KEY); } catch { /* ignore */ }
      return null;
    }
    return g;
  } catch {
    return null;
  }
}

/** 清空授权（比如你自测想回到 Gate 输入界面） */
export function revokeGrant(): void {
  try { localStorage.removeItem(ACCESS_GRANTED_KEY); } catch { /* ignore */ }
}
