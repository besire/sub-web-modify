# 1r.pw 短链接 Worker

这是最轻量的短链接后端：Cloudflare Worker + Workers KV。

它兼容当前前端的短链接接口：

- `POST /short`
- 表单字段 `longUrl`：base64 后的长链接
- 表单字段 `shortKey`：可选自定义短码
- 返回 `{ "Code": 1, "ShortUrl": "https://1r.pw/abc123", "Message": "" }`

## 部署步骤

1. 进入目录：

   ```bash
   cd deploy/shortener-worker
   ```

2. 登录 Cloudflare：

   ```bash
   npx wrangler login
   ```

3. 创建 KV：

   ```bash
   npx wrangler kv namespace create LINKS
   ```

   命令会输出一个 `id`，复制到 `wrangler.jsonc` 的 `kv_namespaces[0].id`。

4. 部署 Worker：

   ```bash
   npx wrangler deploy
   ```

5. 在 Cloudflare 后台绑定域名：

   `Workers & Pages` -> 选择这个 Worker -> `Settings` -> `Domains & Routes` -> `Add` -> `Custom domain` -> 填 `1r.pw`

6. 测试：

   ```bash
   curl -X POST https://1r.pw/short \
     -F 'longUrl=aHR0cHM6Ly9leGFtcGxlLmNvbQ==' \
     -F 'shortKey=test'
   ```

   然后打开：

   ```bash
   https://1r.pw/test
   ```

## 可选安全设置

默认 `/short` 是公开接口。你先跑通可以不设限制。

后续如果要防滥用，可以在 Worker 里启用 `CREATE_TOKEN` secret，并让前端一起带 token。不过 token 放前端也不是强安全，更推荐 Cloudflare 速率限制、WAF 或 Turnstile。
