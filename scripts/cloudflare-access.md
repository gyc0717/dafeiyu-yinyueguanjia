# Cloudflare Access 发布手册（大肥鱼音乐管家）

目标：把本机 `http://127.0.0.1:8791` 通过 Cloudflare Tunnel 发布成
`https://music.你的域名.com`，并且**未通过 Cloudflare Access 验证的人连页面都看不到**。

> 为什么不直接用 quick tunnel：quick tunnel 的流量是匿名公网可访问的，
> 只能靠应用自己的口令挡。Access 是在 Cloudflare 边缘就把人挡掉，
> 不会有一个字节到达本机。

## 前置条件

| 项 | 说明 |
|---|---|
| 域名 | 已托管在 Cloudflare（NS 指向 CF），任意后缀都行 |
| Cloudflare 账号 | 免费版即可，Access 免费额度 ≤50 用户 |
| cloudflared | 已放在 `tools\cf\cloudflared.exe`（v2026.10.7） |
| 应用 | 8791 必须以口令模式跑（`MUSIC_HUB_LAN=1`），见下方「注意」 |

## 第 1 步：登录（需要浏览器，人工点一次）

```powershell
tools\cf\cloudflared.exe tunnel login
```

浏览器会打开 Cloudflare 授权页，选择你的域名 → Authorize。
成功后会在 `%USERPROFILE%\.cloudflared\cert.pem` 生成证书。

## 第 2 步：创建隧道

```powershell
tools\cf\cloudflared.exe tunnel create music-hub
```

记下输出的 Tunnel ID（形如 `3f2a...`），凭证在
`%USERPROFILE%\.cloudflared\<TUNNEL_ID>.json`。

## 第 3 步：写配置

把 `scripts\cloudflare-access.config.yml` 复制到
`%USERPROFILE%\.cloudflared\config.yml`，替换两处占位：

- `<TUNNEL_ID>` → 第 2 步的 ID
- `<你的域名>` → 例如 `music.example.com`

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<你>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: <你的域名>
    service: http://127.0.0.1:8791
  - service: http_status:404
```

> 这里指向 `127.0.0.1` 是安全的：如果哪天 Access 策略被误删，
> 应用自己的口令守卫仍会挡一层（本机免口令只对 127.0.0.1 生效，
> 但隧道回源也是 127.0.0.1 —— 所以**必须**同时做好第 5 步的 Access，
> 或者把 service 改成局域网 IP 让口令守卫参与）。

## 第 4 步：绑定域名

```powershell
tools\cf\cloudflared.exe tunnel route dns music-hub music.你的域名.com
```

会在 Cloudflare DNS 里自动加一条 CNAME。

## 第 5 步：配 Access 策略（控制台操作，无法脚本化）

Cloudflare Dashboard → **Zero Trust** → **Access** → **Applications** → **Add an application**
→ **Self-hosted**

| 字段 | 值 |
|---|---|
| Application name | 大肥鱼音乐管家 |
| Session Duration | 24 hours |
| Application domain | `music.你的域名.com` |

然后 **Add a policy**：

| 字段 | 值 |
|---|---|
| Policy name | 仅本人 |
| Action | Allow |
| Include | Emails → 你的邮箱 |

保存。之后访问 `https://music.你的域名.com` 会先跳 Cloudflare 登录页，
输入邮箱收验证码，通过后才回源到本机。

## 第 6 步：跑起来

前台试跑（先确认能通）：

```powershell
tools\cf\cloudflared.exe tunnel run music-hub
```

确认没问题后装成 Windows 服务（开机自启、后台常驻）：

```powershell
tools\cf\cloudflared.exe service install
```

卸载服务：

```powershell
tools\cf\cloudflared.exe service uninstall
```

## 注意：应用侧的配合

1. **8791 必须以口令模式运行**，否则一旦 Access 策略被误删就是裸奔：

   ```powershell
   $env:MUSIC_HUB_LAN = "1"
   .\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8791
   ```

2. 口令在 `data\lan_token.txt`（12 位），换口令就删掉这个文件再重启。

3. 加固已生效：同 IP 10 分钟内失败 8 次锁 15 分钟，常数时间比较。

4. **不要**把 `8791` 的监听地址改成 `0.0.0.0` 除非确实要给局域网用；
   Tunnel 只需要回源 `127.0.0.1`。

## 最小暴露面清单

| 面 | 期望状态 |
|---|---|
| 公网入口 | 只有 Cloudflare 边缘，且挂 Access 策略 |
| 本机监听 | 8791 仅 `127.0.0.1`（或 `0.0.0.0` 但口令必开） |
| 口令 | ≥12 位，`data\lan_token.txt`，不进 git |
| 失败的请求 | 8 次 → 429 + Retry-After |
| 登录态文件 | `data\*.dpapi`、`data\lan_token.txt` 均在 .gitignore 内 |
