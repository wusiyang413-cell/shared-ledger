# 共享账本部署 (超详细图文版)

我按"你点了哪个按钮会看到什么"来写,跟着抄就行。

---

## 先搞懂 3 个东西

| 名字 | 干嘛的 | 类比 |
|---|---|---|
| **GitHub** | 存代码的网盘 | 装衣服的衣柜 |
| **Vercel** | 跑代码的服务器 | 试衣间(让你朋友看到衣服的样子) |
| **Upstash** | 存数据的数据库 | 账本(记你和你同事花了多少) |

整个流程: **把代码塞衣柜(Vercel 从衣柜拿) → 数据库放账本里(Upstash) → 告诉试衣间账本放哪了(填环境变量) → 同事扫码就能进**

---

## 第 1 步: 注册 GitHub (如果你已经有了就跳过)

1. 打开 https://github.com/signup
2. 输入邮箱、密码、用户名
3. 验证邮箱
4. 选 Free 计划(默认就是 Free)

> 这一步用 1 分钟。**用户名和密码记下来**,下一步要用。

---

## 第 2 步: 注册 Vercel (用刚注册的 GitHub 账号登录)

1. 打开 https://vercel.com/signup
2. 点 **"Continue with GitHub"** 那个按钮(用 GitHub 登录的意思,不用再输密码)
3. 弹窗问"允许 Vercel 访问你的 GitHub" → 点 **"Authorize Vercel"**
4. 进 Vercel 后台,啥都不做,先放着

---

## 第 3 步: 注册 Upstash + 创建数据库 (用同一个 GitHub 登录)

1. 打开 https://upstash.com
2. 点 **"Continue with GitHub"**(跟 Vercel 同一个 GitHub 账号)
3. 进控制台后,点左上角 **"Create Database"**
4. 填写:
   - **Name** 填 `ledger` (任意英文小写)
   - **Type** 默认 `Regional` 不用改
   - **Region** 选 **`AP-Southeast-1 (Singapore)`** ← 这一项重要,选离你近的,新加坡/香港/东京 都行
   - **TLS** 默认开启,不动
5. 点 **"Create"**
6. 创建后页面会跳到数据库详情页,**先别关这个页面**,往下拉找到 **"REST API"** 区域,会看到:
   ```
   UPSTASH_REDIS_REST_URL    https://xxxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN  AXXXxxxxxxXX...
   ```
7. 把这两个值**复制出来**,贴到记事本/微信文件助手,**千万别弄混了**
   - 复制方法:点右边的 **复制按钮**(不是手动选)

> ⚠️ **这一步不能跳过,后面 Vercel 要用到这两个值**

---

## 第 4 步: 把代码推到 GitHub (在衣柜里挂上衣服)

1. 打开 https://github.com/new
2. 填写:
   - **Repository name** 填 `shared-ledger`
   - **Public/Private** 选 **Public**(Vercel 免费版只支持公开仓库)
   - 其他都不勾
3. 点 **"Create repository"**
4. 跳转后页面写着 "uploading an existing file" 链接 → 点它
5. 解压我给你的 `vercel-ledger.zip`,把里面的 4 个文件:
   - `package.json`
   - `vercel.json`
   - `README.md`
   - `app` 文件夹(整个文件夹拖进去,不是只拖里面的 `route.js`)
   
   全部拖到上传框里
6. 拖完等 1-2 秒,点最下面的 **"Commit changes"**
7. 跳转到仓库主页,看到 4 个文件列表就说明成功了

---

## 第 5 步: Vercel 部署 (让试衣间把衣服挂出来)

1. 打开 https://vercel.com/new
2. 列表里找你刚建的 **`shared-ledger`** 仓库(可能要先点 "Adjust GitHub App Permissions" 给 Vercel 授权访问仓库)→ 点右边的 **"Import"**
3. 项目配置页:
   - **Project Name** 默认就行(改不改都行)
   - **Framework Preset** 自动识别为 `Other`,不用改
   - **Root Directory** 不用改
   - 啥都不动,直接点 **"Deploy"**
4. 等待 30-60 秒,页面会显示 "🎉 Congratulations!" 和一个链接:
   ```
   https://shared-ledger-xxx.vercel.app
   ```
5. **不要点这个链接,先去填环境变量**(因为还没连数据库,现在点会报错)

---

## 第 6 步: 填环境变量 (告诉试衣间账本放哪了)

> 这一步是**最容易出错**的,我把每个按钮写清楚

1. 点 Vercel 页面左上角菜单 → 找到你的 **`shared-ledger`** 项目,点进去
2. 顶部有 5 个标签: **Project / Deployments / Analytics / Logs / Settings**,点 **"Settings"**
3. 左侧菜单找 **"Environment Variables"**,点进去
4. 看到 3 个输入框,填第 1 个:
   - **Key (变量名)**: `UPSTASH_REDIS_REST_URL`
   - **Value (值)**: 把刚才 Upstash 复制的 URL 粘进来
   - **Environments**: 三个全勾(Production / Preview / Development)
   - 点 **"Save"**
5. 同样方法填第 2 个:
   - **Key**: `UPSTASH_REDIS_REST_TOKEN`
   - **Value**: 粘 Token
   - **Environments**: 全勾
   - 点 **"Save"**
6. **回到 "Deployments" 标签**(顶部),你会看到 1 条部署记录
7. 点这条记录最右边的 **"..." 三个点** → 弹菜单点 **"Redeploy"** → 弹窗里点 **"Redeploy"** 确认
8. 等 20-30 秒,看到新部署的状态变成 **"Ready"** 就 OK 了

---

## 第 7 步: 试一下 (打开链接)

1. 点 Vercel 项目顶部 **"Project"** → 右上角点 **"Visit"** 按钮
2. 浏览器打开后,应该看到:
   - 余额 **¥10000**
   - 绿色"同步中"小点
3. 试着点 "25 元/人 → 2人" → 填名字(例:小明)→ 点"确认扣账"
4. 提示"扣账成功",余额应该变成 ¥9950
5. 刷新页面,数据还在就说明完全成功了

---

## 第 8 步: 分享给同事

把链接(例 `https://shared-ledger-xxx.vercel.app`)发给同事微信,他打开后:
1. 顶部"操作人"框填自己的名字
2. 名字会记住,下次打开自动填
3. 你们俩任何一个人扣账,对方手机 1-2 秒内自动同步

**小提示**: 同事点开前提醒他"用 Chrome 或 Safari 打开,微信里偶尔会拦截",最好把链接复制到浏览器访问。

---

## 故障排查

| 现象 | 怎么修 |
|------|------|
| Vercel 链接打开白屏 | 等 30 秒(冷启动);不行就 Redeploy 一次 |
| 扣账报"保存失败" | 检查 Settings → Environment Variables,值有没有多/少空格,改完 Redeploy |
| 余额一直是 ¥10000 但数据没存上 | Upstash 的 Token 复制错了,重新去 Upstash 控制台复制,Redeploy |
| Vercel 找不到我的仓库 | 第 5 步点 "Adjust GitHub App Permissions" 给 Vercel 授权 |
| GitHub 仓库上传失败 | 单个文件不要超过 25MB,文件夹要整包拖 |

---

## 全部成功后,你应该长这样:

✅ 手机/电脑浏览器打开 `https://shared-ledger-xxx.vercel.app`
✅ 看到余额 ¥10000
✅ 扣一笔账,两台设备都看到变化
✅ 关电脑链接照样能用

---

## 哪天不想用了 / 改回本地方案:

- **暂停云端**: Vercel 项目 → Settings → General → 拉到最下面点 "Pause Project"
- **清空数据**: Upstash 控制台 → 你的 database → "Data Browser" → 找到 `ledger:state` 删掉
- **彻底删除**: Vercel 项目 → Settings → General → Delete Project;Upstash 数据库 → 点 "Delete"
