<div align="center">

# ✦ Pindou Studio ✦

### 任意图片 → 拼豆底稿，一键生成

[![License](https://img.shields.io/badge/License-AGPL%20v3-blue?style=for-the-badge)](./LICENSE)

本地优先的开源拼豆工作台 — 图片生成 · 精细编辑 · 项目保存 · 制作进度 · 图纸与采购清单导出

**移动端**（竖屏）：快速生成图纸，适合手机使用 · **桌面端**（横屏）：完整工作台，适合电脑精细编辑

</div>

---


本仓库基于 [Zippland/perler-beads](https://github.com/Zippland/perler-beads) 继续开发，保留完整上游历史并整体使用 AGPL-3.0。当前已完成核心图像生成、精修、本地项目、制作模式和导出链路，并持续进行稳定性维护。

纯前端 `local-only` 版本已发布到
[pindou.blogchen.asia](https://pindou.blogchen.asia/)；


## 功能

- **安全图片生成** — 支持 JPG、PNG、WebP，校验文件签名、尺寸和像素预算；支持裁剪、旋转、翻转、透明背景与独立宽高
- **颜色与图案算法** — Lab + CIEDE2000 最近色匹配、最大颜色数、相似色合并、最小连通区、孤立像素清理、轮廓保护和四种生成模式
- **后台计算** — 生成与高分辨率导出使用 Web Worker，具备任务版本、进度、取消和“最新任务优先”语义
- **精细编辑** — 画笔、橡皮、吸管、油漆桶、选择、移动、复制粘贴、区域翻转、全局/连通区替换，以及至少 100 步 patch 撤销/重做
- **本地项目** — IndexedDB 自动保存、项目列表与缩略图、重命名/复制/删除，以及严格校验和版本迁移的 `.bead.json` 导入导出
- **豆板与制作模式** — 豆板预设、自定义尺寸与豆径、精确分板、成品尺寸、制作进度、定位高亮、防误触和 Wake Lock 降级
- **统计与导出** — 全项目/当前板统计、Excel 兼容采购 CSV、三种 PNG 和按豆板分页的 A4 PDF
- **本地优先 PWA** — 默认不上传图片或项目、不依赖账号或云服务；公开版本不创建授权凭据，也不会请求 `/v1` API
- **可选授权客户端** — `cloud` 构建可连接独立 `bead-cloud` 的版本化 HTTPS API；云服务失败不影响生成、编辑、保存和普通导出

## 相比原项目新增与升级

对照基线为上游 [Zippland/perler-beads](https://github.com/Zippland/perler-beads) 的
`2efee730`。原项目已经具备像素化、多品牌色板、背景移除、基础手动编辑、颜色替换、CSV 源数据、专心模式和 PWA；下表只列 Pindou Studio 在此基础上的实质增量。

| 领域 | 原项目 | Pindou Studio 增量 |
|---|---|---|
| 图片导入与预处理 | JPG/PNG/GIF 与 CSV，基础图片读取 | 文件扩展名、MIME、魔数、大小和像素预算校验；明确拒绝 SVG/损坏文件；新增 WebP、裁剪、90° 旋转、水平/垂直翻转、缩放和主体位置控制 |
| 颜色与生成算法 | 同步像素化、最近色匹配、颜色合并和边界去背景 | 标准 Lab + CIEDE2000、版本化色板预编译、最大颜色数、四种生成模式、抖动、最小连通区、孤立像素/邻域清理、轮廓保护和固定质量回归 |
| 计算模型 | 生成主要在主线程执行 | 生成和高分辨率导出进入 Web Worker，提供任务协议、进度、真正取消、异常恢复和“最新任务优先” |
| 图案编辑器 | 单格着色、橡皮擦、颜色替换、放大镜和页面内撤销 | 无 React 的编辑命令、至少 100 步 patch 撤销/重做、油漆桶、矩形选择、移动、复制粘贴、连通区替换、区域翻转、多视图、缩放平移、双指手势和防误触锁 |
| 本地项目 | 页面状态与专心模式数据主要保存在 localStorage | IndexedDB 项目列表、750 ms 自动保存、缩略图、重命名/复制/删除、严格 `.bead.json`、跨版本迁移、损坏数据原子拒绝和存储失败降级 |
| 豆板与制作 | 专心模式、颜色高亮和完成展示 | 通用/自定义豆板、豆径和成品尺寸、精确分板边界、按板导航、版本化完成位图、制作位置恢复、板/整体进度、防误触和 Wake Lock 降级 |
| 统计与导出 | 基础颜色统计、PNG 图纸/采购图和 CSV 源数据 | 从项目事实源现算全项目/当前板统计；Excel 兼容采购 CSV；纯图案/网格/色号三种 PNG；倍率与背景；一板一页 A4 PDF；导出进度、取消和像素预算 |
| 部署与授权 | 单体前端和旧 PWA 配置 | 严格 `local-only`/`cloud` 构建边界；公开版零云请求；可选设备公钥授权客户端；独立 `bead-cloud` API；云故障不影响基础功能 |
| 工程质量 | 只有开发、构建和旧 lint 脚本，未建立自动化测试矩阵 | 103 个单元测试、22 个 Chromium 场景、local-only 专项、30 图固定回归、资产/许可证/安全门禁、在线依赖审计、GitHub Actions 与可复现 PWA 图标 |

功能取舍：上游支持 GIF 首帧导入；当前安全导入策略改为 JPG、PNG、WebP，并拒绝 GIF 与 SVG。自定义色板、基础去背景、颜色排除/替换、放大镜和专心模式属于原项目已有能力，不重复计为新增。

## 快速开始

要求：Node.js 22–24、npm 10；推荐使用 `.nvmrc` 中记录的 Node 版本。

```bash
npm ci
cp .env.example .env.local # Windows 可手工复制
npm run dev
```

浏览器打开 `http://localhost:3000`。

公开部署前必须把 `.env.local` 中的 `NEXT_PUBLIC_SOURCE_CODE_URL` 改为该部署版本对应的公开源码仓库。

## 部署模式

默认 `NEXT_PUBLIC_DEPLOYMENT_MODE=local-only`，图片处理、项目保存和普通导出完全在浏览器本地运行，
不配置也不会连接授权服务。

仅内部云功能部署可改为 `cloud`，并同时提供 HTTPS
`NEXT_PUBLIC_BEAD_CLOUD_API_URL`。模式与地址冲突、地址含凭据/路径/查询参数，或生产环境使用非 HTTPS 地址时，构建会失败。

## 质量检查

```bash
npm run ci
npm run test:e2e
npm run test:e2e:local-only
```

`npm run ci` 依次执行 lint、类型检查、Vitest、固定素材与 PWA 资产校验、许可证清单、安全策略、在线生产依赖审计和生产构建。GitHub Actions 会对 push 和 pull request 执行同等质量门禁，并在其后运行浏览器回归。

`npm run audit:prod:online` 会把依赖图发送到 npm 漏洞服务；本地执行前应确认允许该外部请求。

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 15 + React 19 + TypeScript |
| 样式 | Tailwind CSS |
| 图像处理 | Canvas API + Web Worker |
| 本地存储 | IndexedDB |
| 边界校验 | Zod |
| 测试 | Vitest + Playwright |
| 发布与 CI | Vercel + GitHub Actions |




## 核心设计


- 核心颜色、图案、编辑、项目、豆板、制作和统计逻辑与 React/DOM 解耦，便于纯函数测试。
- 项目网格是统计和导出的事实源；透明外部格不计入数量，也不会跨越清理边界。
- 图片生成使用 Lab + CIEDE2000 和预编译版本化色板；等距匹配稳定，空色板明确报错。
- 编辑历史保存前向/反向 patch，不为每一步复制完整画布。
- `.bead.json`、IndexedDB 数据、Worker 消息和云 API 都有显式版本与严格边界校验。
- `bead-cloud` 是独立程序，只通过 `/v1` HTTPS JSON API 通信；基础产品始终可离线使用。

### 调色板数据

色板数据定义在 [`src/app/colorSystemMapping.json`](src/app/colorSystemMapping.json)，包含 291 种标准颜色到 5 个品牌色号体系的映射。色板组合在 [`src/app/page.tsx`](src/app/page.tsx) 中配置。

## 项目进度

- [x] 阶段 0：上游审计、许可证治理、仓库与 CI 初始化
- [x] 阶段 1：颜色核心、安全导入、量化清理、Worker 与固定回归
- [x] 阶段 2：完整编辑器、patch 历史、Canvas 视口与移动交互
- [x] 阶段 3：IndexedDB 本地项目、自动保存、导入导出与迁移
- [x] 阶段 4：豆板计算、制作模式与进度持久化
- [x] 阶段 5：统计、PNG/CSV 与 A4 PDF 导出
- [x] 阶段 6：可选授权客户端与独立 `bead-cloud` 边界
- [x] 纯前端 `local-only` 发布模式、原创 PWA 图标与 Vercel 部署
- [x] 正式域名 `https://pindou.blogchen.asia/` 接入，首页、manifest 和 PWA 图标可访问
- [ ] 目标用户网络可用性和性能验收
- [ ] 品牌色板来源、准确性和再分发权闭环
- [ ] 真实 Safari 桌面、Chrome Android、Safari iPhone 验收
- [x] CIEDE2000 (Delta E) 颜色距离算法
- [ ] Floyd-Steinberg 抖动，在有限色板下模拟更丰富的颜色过渡
- [x] Web Workers 后台计算，优化大图性能
- [ ] 用户自定义调色板上传
- [ ] 微信小程序版本



## 参与贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/your-feature`)
3. 提交更改 (`git commit -m 'Add some feature'`)
4. 推送到分支 (`git push origin feature/your-feature`)
5. 创建 Pull Request

提交前请至少执行 `npm run ci`；涉及交互、存储、导出或部署模式时，同时运行对应 Playwright 回归。

## 共创声明

上游项目永久开源，并由原维护者运营相关站点。本衍生项目保留其作者和社区声明，详见 [NOTICE.md](./NOTICE.md)。

我们公开全部算法细节和源代码，目的是推动拼豆工具生态的共同进步。欢迎所有人学习、使用、改进。

**但请勿将本项目代码恶意抄袭后包装为闭源商业产品。** 这一行为违反开源协议，也伤害每一位贡献者的热情。使用本项目代码的衍生作品须遵守许可证条款，保留原始版权声明，并以相同协议开源。

## 许可证

[AGPL-3.0](./LICENSE)。上游来源、原作者和修改说明见 [NOTICE.md](./NOTICE.md)，第三方依赖见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)，公开静态资产来源见 [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md)。
