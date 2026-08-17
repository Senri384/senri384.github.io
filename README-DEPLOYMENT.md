# Portfolio — Vercel deployment copy

这是从主项目生成的独立精简副本。主项目中的制作母版、历史构建、设计参考和旧版 UI 素材没有被修改。

## 本地构建

1. 安装依赖：`npm ci`
2. 生成部署产物：`npm run build`
3. 静态网站输出位于：`dist`

## 阶段五兼容修复后基线

- 待提交源码包（不含 `dist`）：约 585.08 MiB / 1053 个文件
- 源 `public`：约 582.90 MiB / 972 个文件
- 部署构建：约 326.32 MiB / 1021 个部署文件
- Astro 页面：41
- HTML 入口：42
- 构建后资源缺失：0
- 390 px 移动端整页横向溢出：0（宽表格在自身容器内滑动）

## 首版托管决定

- 使用 Vercel Hobby，从个人 GitLab 私有仓库导入。
- 7 个 MP4 全部保留在 `public` 中并随网站部署。
- 不启用 Cloudflare R2，因此不会产生 R2 订阅或超额费用。
- 不要在 Vercel 中设置 `PUBLIC_MEDIA_BASE_URL`；变量为空时使用网站自身的视频路径。
- 已验证的 WebP 优化资源已经固化在交付副本中；构建只执行引用切换，不依赖云端 FFmpeg。

若以后迁移到独立媒体存储，可在部署平台设置：

`PUBLIC_MEDIA_BASE_URL=https://你的媒体域名/portfolio-v1`

重新构建后，7 个 MP4 地址会统一切换到该域名；其余图片、音频与页面路径不变。上传、校验与回退步骤见阶段四报告中的 `R2-MIGRATION.md`。

本副本不提交 `node_modules`、`dist`、`.astro`、本地环境变量或旧托管平台配置。交付到其他设备后请先运行 `npm ci`。

## Vercel 导入设置

- Framework Preset：Astro（仓库中的 `vercel.json` 已固定）
- Build Command：`npm run build`
- Output Directory：`dist`
- Install Command：使用 Vercel 默认值
