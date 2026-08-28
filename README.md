# VocabTest · 英语词汇量测试网站（React + Vite + TypeScript）

一个 **纯静态、零后端** 的词汇量自测网站：用 GitHub [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) 词库做源数据，预处理为 10 档词汇（小学入门 → GRE，共 **64,432 个去重词条**），基于「自适应分层抽样 + 双关卡判题（认识/不认识 + 4 选 1）」算法估算词汇量，并生成可分享的 PNG 报告、可打印默写纸与历史记录。

## ⚡️ 快速开始

```bash
npm install           # 安装依赖
npm run ensure-data   # 确保 src/data/levels/L{1..10}.json + index.json 存在（首次 npm install 后会自动执行一次）
npm run dev           # 本地开发服务器 http://localhost:5173
npm run build         # 生产构建（tsc -b && vite build）
npm run preview       # 预览构建产物（需要先 build）
npm test              # 运行所有 Vitest 单元/组件测试
npm run test:coverage # 运行测试并输出 v8 覆盖率报告
```

## 🧪 测试 & 质量

- **Vitest**：单元 + 组件测试（`jsdom` + `@testing-library/react`）
  - `npm test` → **49 / 49 passed**
  - `npm run test:coverage` → 总体 **93.01% statements；`src/utils/` 95.3% ≥ 90%；`src/pages/` 94.92%**
- **TypeScript 严格类型**：`tsc -b` **0 errors**
- **Build 体积**: `dist/assets/index-*.js` gzip ≈ **9.85 KB**（< 500KB 门槛）；`recharts` / `html2canvas` 已拆成独立 chunk，首屏不加载

## 🧩 目录与模块

```
src/
├─ components/
│   ├─ PageShell.tsx      # 页面外壳：导航栏、主题切换、历史记录入口
│   ├─ ProgressBar.tsx    # 进度条
│   ├─ ThemeToggle.tsx    # 深色/浅色切换按钮
│   └─ WordCard.tsx       # 答题卡：judge / choose / feedback 三态
├─ hooks/
│   ├─ useQuizEngine.ts   # 核心状态机：L3~L8 词档加载 + pickNext 自适应抽样 + 统计
│   ├─ useStorage.ts      # localStorage（vocab:history）最近 20 条历史记录 API
│   ├─ useSpeech.ts       # SpeechSynthesis 朗读发音（含 polyfill）
│   └─ useTheme.ts        # 深色模式（localStorage vocab-theme + prefers-color-scheme）
├─ pages/
│   ├─ Home.tsx           # 首页：快速/精准模式 Tab + 开始按钮
│   ├─ Quiz.tsx           # 答题页：进度条 + WordCard + 键盘快捷键
│   ├─ Result.tsx         # 结果页：4 大模块 + 微信二维码占位 + 导出 PNG/TXT
│   ├─ History.tsx        # 历史记录：分档条形 + 查看/删除/清空
│   └─ Dictation.tsx      # 默写纸：中文释义 + 虚线下划线 + 打印/PDF
├─ utils/
│   ├─ levels.ts          # listLevels / getLevelMeta / loadLevel 动态 import L*.json
│   ├─ estimator.ts       # LOOKUP_TABLE (10 档) / matchLookupBand / estimate：Σ(mastery×levelTotal)
│   └─ sampler.ts         # createSamplerState / pickNext / makeDistractors / shuffleOptions / applyAnswer
├─ data/levels/           # 词档数据 JSON（预处理产物，L1.json ~ L10.json + index.json）
└─ test/setup.ts          # Vitest jsdom polyfill：localStorage / SpeechSynthesis / ResizeObserver / Blob.text
```

## 🧠 算法简述（PRD §5）

1. **首题起档 L4**；**最近 5 题 hitRate ≥ 60% 升档 / ≤ 30% 降档**；同档 ≥10 题再 +1 避免原地踏步。
2. **不认识** → 直接记未掌握；**认识** → 进入 4 选 1，**答对算掌握**。
3. `Σ (mastered/sampled × levelTotal)` → 估算总词汇量；**CI（95% 相对置信区间）** = `Wilson 比例 × 100%`（精准模式 × 0.7 缩小）
4. 用 `LOOKUP_TABLE` 匹配到 `{官方考试线, 百分位, 全球非母语自测者参照}` 对照行。

## 🧾 结果页 4 大模块（PRD §3.2 / §4）

1. **模块 1 主卡**: 词汇量大号数字（带千分位）、置信区间 ±X%、10 档完整对照表 + 匹配行高亮、对标考试线与百分位
2. **模块 2 分档诊断**: Recharts 双条形图（抽样 vs 掌握）+ 10 档 L1~L10 掌握比例条 + 未掌握数徽标
3. **模块 3 微信二维码占位**:
   - 220×220 虚线占位框（`wechat-qr-placeholder`）→ 替换为你的二维码 PNG（建议命名 `public/wx-qr.png` 后在 `Result.tsx` 里用 `<img src="/wx-qr.png">`）
   - 微信号：`VocabTest-Official`（Result.tsx 顶部 `WECHAT_ID_PLACEHOLDER` 修改）
   - 4 项学习包 Gift 文案（100 核心词 / 21 天计划 / 默写纸 / 发音 MP3）
4. **模块 4 操作**:
   - 💾 保存到历史记录（localStorage，最近 20 条）
   - 📸 下载 PNG 分享卡（html2canvas，分享图 = 模块 1 区域）
   - 📝 导出未掌握词 TXT（`单词 | 释义 | 档位`，可直接打印）
   - 🖨️ 打开默写页（Dictation 中文释义 + 横线下划线；`window.print()` 可保存 PDF）

## 🔧 配置替换（个性化）

| 想改什么 | 改哪里 |
|---|---|
| 微信号 / 学习包礼物清单 | `src/pages/Result.tsx` 顶部 `WECHAT_ID_PLACEHOLDER` + module-wechat 的 `<ul>` 文案 |
| 微信二维码图片 | 在 `src/pages/Result.tsx` 里把 `wechat-qr-placeholder` 的占位 `<div>` 换成 `<img src="/wx-qr.png">`，把图片放 `public/wx-qr.png`（220×220 透明 PNG 最佳） |
| 名称/品牌色 | `tailwind.config.js` 顶部 `theme.extend.colors.brand.*` |
| 测试题数 / 档位映射 | `useQuizEngine.ts` 的 `MODE_LIMIT`；`scripts/build-word-data.js` 的 `LEVEL_MAP` |
| 词档对照考试线描述 / 百分位 | `src/utils/estimator.ts` 顶部 `LOOKUP_TABLE` |

## 📦 纯静态部署

```bash
npm run build
# dist/ 直接上传到：
# - GitHub Pages / Vercel / Netlify / Cloudflare Pages / 阿里云 OSS静态站 / 腾讯云 COS静态站
# - 或者 nginx 静态站点 root /.../dist；index.html try_files 需要 SPA fallback
```

## 🛠️ 数据预处理脚本（开发者）

词源项目已经下载到 `../english-vocabulary/` 时，重新生成 10 档数据：

```bash
node scripts/build-word-data.js   # 读 english-vocabulary/**/*.jsonl → 写 src/data/levels/*.json
```

## 🗒️ License

词源数据版权归属原仓库；本项目代码 MIT。
