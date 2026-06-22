# 共享账本 V2 — 修复版 (2024-06-23)

## 这次改了什么?

之前版本 1 的 `app/api/route.js` 在 Vercel 上 404,因为 App Router 的 `app/api/` 路径**只能处理 `/api/xxx`**,不能处理根路径 `/`(首页)。

这次改成 **Pages Router**(Vercel 最经典的部署方式),每个页面一个独立文件:
- `pages/index.js` → 打开首页显示 HTML
- `pages/api/state.js` → GET /api/state
- `pages/api/charge.js` → POST /api/charge
- `pages/api/reset.js` → POST /api/reset
- `pages/api/events.js` → GET /api/events (SSE 实时同步)
- `lib/state.js` → 共享的状态管理模块

## 部署步骤

### 你已经做过的(不用重复):
✅ 注册 GitHub
✅ 注册 Vercel
✅ 注册 Upstash + 创建数据库 + 复制 URL 和 Token

### 接下来要做的:

#### 1. 删掉旧仓库里的文件,上传新文件
1. 打开 https://github.com/wusiyang413-cell/shared-ledger (换成你的用户名)
2. **删掉所有旧文件**(点进每个文件,右上角 ... → Delete file,逐个删除):
   - `app` 文件夹(整个)
   - `package.json`
   - `vercel.json`
   - `README.md`
3. 回到仓库首页,点 **"Add file"** → **"Upload files"**
4. 把解压后的 `vercel-ledger-v2` 文件夹里的所有文件拖进去:
   - `pages/` 文件夹(整个,里面有 index.js + api/)
   - `lib/` 文件夹(整个,里面有 state.js)
   - `package.json`
   - `vercel.json`
5. 点 **"Commit changes"**

#### 2. Vercel 会自动重新部署
上传后等 30-60 秒,Vercel 自动检测到代码变更并重新部署。
去 Vercel Deployments 页面查看最新状态。

#### 3. 填环境变量(如果你还没填过)
如果之前的 Vercel 项目里**还没填过环境变量**,现在填:
1. Vercel 项目 → **Settings** → **Environment Variables**
2. 添加:
   - Key: `UPSTASH_REDIS_REST_URL`  Value: (Upstash 的 URL)
   - Key: `UPSTASH_REDIS_REST_TOKEN`  Value: (Upstash 的 Token)
3. Save → Deployments → 最新那条 → Redeploy

#### 4. 测试
打开你的链接: `https://shared-ledger-rust.vercel.app`
应该看到余额 ¥10000 页面 ✅
