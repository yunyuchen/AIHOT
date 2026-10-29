# 部署

## 用 Docker（推荐）

需要一台装了 Docker（带 Compose）的机器。云服务器建议至少 2 核、4 GB 内存，构建镜像时要用到。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

`init-env.ts` 会生成 `.env`，填好随机密钥和管理员密码，并把密码打印一次。机器上没有 Node 的话，把 `.env.example` 复制成 `.env`，自己填 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`（各用 `openssl rand -hex 32` 生成）和 `LLM_API_KEY`。

启动后打开 `http://服务器地址:3000`，后台在 `/admin`，用管理员密码登录。第一次启动会导入示范信源，一两分钟后开始出现内容；第一次导入的一百多条资料大约半小时处理完（每条都要预筛、评分，入选的还要写标题摘要）。

镜像构建时按 `.env` 里的 `INDUSTRY_PACK` 选行业包（`industry-packs/` 下的目录名，不填就是 `manufacturing`），镜像里只有选中的那一份；名字写错，构建会直接停下并列出可选项。

`docker compose` 会起五个容器：`db`（PostgreSQL 17）、`setup`（每次启动先跑数据库迁移和种子数据，然后退出）、`api`、`worker`（抓取、模型处理、定时任务）、`web`（网页）。

### 在中国大陆的服务器上

- 构建时 npm 走国内镜像：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`，然后 `docker compose up -d`。
- 拉取 Docker 镜像慢，先给 Docker 配置镜像加速。
- 海外信源抓不到时，在 `.env` 里设置 `EGRESS_PROXY_URL`：抓信源、图片和模型榜数据时走这个代理，调用模型接口不走。
- 对外提供网站服务需要先完成 ICP 备案，备案号填在行业包 `site.ts` 的 `icp`。

### 配域名和 HTTPS

先把域名解析到服务器，然后在 `.env` 里设置：

```bash
SITE_URL=https://example.com
SITE_DOMAIN=example.com
PORT=127.0.0.1:3000        # 3000 端口只给本机的 Caddy 用，不直接对外
TRUST_PROXY=true           # 访客地址从 Caddy 转来的请求头里读
```

再用带 HTTPS 的方式启动，Caddy 会自动申请和续期证书：

```bash
docker compose --profile https up -d --build
```

已经有 Nginx 的话，不用 Caddy，把站点反向代理到 `http://127.0.0.1:3000`，带上 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`，并在 `.env` 里设 `TRUST_PROXY=true`。`SITE_URL` 一定要写成读者实际访问的地址：生成的链接、RSS、分享图和 MCP 都用它。

### 同一台机器跑两套行业实例

一台机器可以并排跑几套站点（比如一套制造、一套体育），数据库、容器、数据卷和镜像各是各的。做法是：每套在自己的目录里、用自己的 `.env` 运行 `docker compose`，网页只绑本机端口；80/443 交给宿主机上的一个反向代理，按域名分到各套的端口。这时不要用 `--profile https`：每套自带的 Caddy 都要占 80/443，第二套起不来。自带的 Caddy 只适合一台机器一套站。

每套一个目录，各自 clone 一份代码，各自的 `.env` 里用 `INDUSTRY_PACK` 选自己的行业包（镜像构建时打进去，所以两套各自构建）：

```
/srv/manufacturing/   # .env 里 INDUSTRY_PACK=manufacturing（不填也是它）
/srv/sports/          # .env 里 INDUSTRY_PACK=sports
```

两套 `.env` 里必须设成不同值的：

| 变量 | 第一套 | 第二套 | 说明 |
|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | `manufacturing` | `sports` | 项目名，默认 `aihot`。容器（`sports-web-1`）、网络（`sports_default`）、数据卷（`sports_db`）都以它为前缀 |
| `IMAGE_NAME` | `manufacturing-app` | `sports-app` | 镜像名，默认 `aihot-app`。两套同名的话，构建一套就顶掉了另一套的镜像，另一套下次重启会跑成这一套的行业包 |
| `PORT` | `127.0.0.1:3010` | `127.0.0.1:3020` | 写成“地址:端口”就只绑本机，外面只能经反向代理访问 |
| `SITE_URL` | `https://manufacturing.example.com` | `https://sports.example.com` | 各自读者实际访问的地址 |

另外每套都要设 `TRUST_PROXY=true`，并且：

- `ADMIN_PASSWORD`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD` 每套各用各的。在每个目录里各跑一次 `node scripts/init-env.ts`，生成的就是两套不同的。
- 模型 key 可以共用，但预算上限（后台“设置 → 预算”）每套只管自己的调用，服务商那边的账单是两套加起来。
- 安全阀 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`、`WECHAT_SUBSCRIBE_PUSH_ENABLED` 各管各的。新起的一套可以先关着采集和模型调用，看页面和后台没问题再打开。
- 飞书的 webhook 和群、`INDEXNOW_KEY` 每个站各用各的，不然两个站的推送和告警会混在一起。告警每条开头都写着站名（行业包 `site.ts` 里的 `SITE.name`，比如“【锐奇运动健康】”），转发出去也认得出是哪个站的。
- 数据库备份的 `DB_BACKUP_STORE_*` 每套用各自的 bucket，密钥只给到自己的 bucket，一套出了事删不到另一套的备份。备份文件名以板块 key（`site.ts` 里的 `BOARD.key`）开头，比如 `daily/manufacturing-<时间>.dump` 和 `daily/sports-<时间>.dump`，万一配进同一个 bucket 也不会互相覆盖（同一个行业包的两份部署共用一个 bucket 仍会覆盖）。
- `API_BASE_URL`、`DATABASE_URL` 不用设也不用改：compose 把它们指向本项目里的 `api` 和 `db`，每套在自己的网络里，连不到另一套。`SITE_DOMAIN` 只给自带的 Caddy 用，这里也不用设。

**线上模型切换记录（2026-10-29）**：制造和运动健康实例经使用者指定，默认文本模型从 DeepSeek 官方 `deepseek-flash` 切为网关 `https://rq.yunyc.work/v1` 的 `gemini-4-argon`。各自服务器 `.env` 的 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 已更新，`LLM_EXTRA_JSON={}`，不再携带 DeepSeek 专用的 `thinking` 参数；密钥仅保存在服务器受保护配置中，文件权限为 `600`，不入库。两套 `api`、`worker`、`web` 已通过 Compose 重建（未重建镜像、未重跑迁移），11 个模型能力均解析到新配置；重启后各完成一次真实 JSON 输出校验，制造回执 `26347`、运动健康回执 `6921` 均为 `completed`，公开小程序元信息正常。预算、采集和推送开关保持不变；切换只影响后续生成，不自动重写历史文章或日报。这里记录的是网关提供的模型标识，不代表对其底层模型身份的独立认证。

**同日再次切换至 Astra（当前配置）**：按使用者要求，沿用上述网关，模型改为其 `/v1/models` 列出的 `gpt-6-astra`，并更换两套服务器上的模型密钥；`LLM_EXTRA_JSON={}`、预算、提示词、评分门槛和安全阀保持不变。两套服务重建后，11 个模型能力均指向 Astra；真实 JSON 调用回执为制造 `26354`、运动健康 `6966`，均为 `completed`，两套公开小程序精选接口正常。服务器 `.env` 权限仍为 `600`，密钥不入库，历史内容未重写。

宿主机的反向代理用 Caddy 的话（会自动申请和续期证书）：

```
manufacturing.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3010
}

sports.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3020
}
```

用 Nginx 的话（证书用 certbot 之类自己签），每个站一段：

```nginx
server {
    listen 443 ssl;
    server_name manufacturing.example.com;
    ssl_certificate     /etc/letsencrypt/live/manufacturing.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/manufacturing.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
# sports.example.com 照抄一段，proxy_pass 改成 http://127.0.0.1:3020
```

在哪个目录里运行 `docker compose`，就只动哪一套：compose 从当前目录的 `.env` 读项目名和镜像名。在 `/srv/sports` 里 `up -d --build`、`down`、`logs`、`exec`，碰的只是 `sports-*` 容器、`sports-app` 镜像和 `sports_*` 数据卷，另一套照常运行。要小心的是 `docker compose down -v`（删掉当前目录这套的数据）和 `docker image prune -a`（会删掉当时没在运行的那套的镜像，之后要重新构建）。

已经在跑的站可以原样当作其中一套：它没设这几个变量，项目名就是 `aihot`、镜像就是 `aihot-app`，只给新的一套设别的值。不要给已经在跑的站改 `COMPOSE_PROJECT_NAME`：数据卷按项目名命名，改了以后 compose 会新建一套空卷，旧数据还在原来的卷里，但站上看不到了。原来用自带 Caddy 的，先在它的目录里 `docker compose --profile https rm -sf caddy` 停掉删掉，`.env` 里把 `PORT` 改成 `127.0.0.1:3000` 这样只绑本机，再交给宿主机的反向代理。

在服务器上验证两套互不干扰：

```bash
cd /srv/manufacturing && docker compose up -d --build
cd /srv/sports && docker compose up -d --build

docker compose ls                                         # 两个项目各自在运行
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'   # 容器名前缀、镜像各不相同；端口是 127.0.0.1:3010->3000 和 127.0.0.1:3020->3000
docker volume ls --format '{{.Name}}'                     # manufacturing_db、manufacturing_data、sports_db、sports_data
ss -ltn | grep -E ':(80|443|3010|3020) '                  # 3010、3020 只在 127.0.0.1 上，80/443 是宿主机的反向代理

# 每套跑一遍完整的 smoke。在 web 容器里跑，用的是这套自己的行业包，宿主机不用装 Node：
cd /srv/manufacturing
docker compose exec -T web node scripts/smoke.ts --base http://localhost:3000   # 这套本身
docker compose exec -T web node scripts/smoke.ts                                # 不带 --base 就访问 SITE_URL，经过宿主机的反向代理
cd /srv/sports
docker compose exec -T web node scripts/smoke.ts --base http://localhost:3000
docker compose exec -T web node scripts/smoke.ts

# 重建一套，另一套不受影响：
cd /srv/sports && docker compose up -d --build --force-recreate
docker ps --format '{{.Names}}\t{{.Status}}'              # manufacturing-* 的运行时间接着涨，没有重启
cd /srv/manufacturing && docker compose exec -T web node scripts/smoke.ts
```

容器里访问不到本机的公网域名时，在别的装了 Node 的机器上，用对应行业包的代码跑 `node scripts/smoke.ts --base https://manufacturing.example.com`。

### 更新

```bash
git pull
docker compose up -d --build
```

数据库迁移只做向后兼容的增量，更新时自动执行。

### 备份

在 `.env` 里配置 `DB_BACKUP_STORE_*`（任何 S3 兼容的对象存储），每天 04:10 自动备份到那里：数据库是 `<板块 key>-<时间>.dump`，上传的文件打包成 `<板块 key>-files-<时间>.tar.gz`，放在 `daily/` 下，周日另存一份到 `weekly/`，每月 1 日另存一份到 `monthly/`，过期规则可以按这三个前缀分别设。板块 key 是行业包 `site.ts` 里的 `BOARD.key`；时间是 UTC，北京时间 10 月 18 日 04:10 那次叫 `manufacturing-202610172010.dump`。`data` 卷的 `backups/` 里每种留最近 3 份，以前留下的 `aihot-<时间>.dump` 这类旧名字也算在内，会随新备份轮换掉。也可以手动导出：

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

数据都在三个 Docker 卷里：`db`（数据库）、`data`（上传的图片、图片缓存、本地备份）、`caddy`（证书）。实际的卷名前面带项目名，默认是 `aihot_db` 这样。`docker compose down` 不会删除它们；`docker compose down -v` 会。

### 看日志

```bash
docker compose logs -f --tail 100 api worker web
```

后台的“运行”页能看到每个定时任务最近的结果，“信源”页能看到每个信源的抓取状况。

## 花多少钱

- **模型**：每条新资料至少预筛一次；可能入选的再评分两次，入选的还要写标题摘要、打标签、归组，另外还有日报和事件综述。我们用示范信源在本地试跑，第一次导入的 152 条资料一共用了大约 930 次模型调用。之后每天用多少，取决于你的信源每天更新多少条。后台“模型与评测”页能看到每一步的调用次数和输入输出 token 数。
- **付费采集**（X、公众号、Jina）：按请求计费，默认不启用，填了 key 才会用。
- 所有付费服务都有每分钟、每小时、每天的调用上限（后台“设置 → 预算”），超过就暂停，不会一夜之间刷爆账单。填 0 表示立即停用这个服务。

## 不用 Docker

需要 Node.js 24.11 以上和 PostgreSQL 16 或 17。

```bash
npm ci
node scripts/init-env.ts --llm-key <你的模型 API Key>
createdb myhot
```

在 `.env` 里加上：

```bash
DATABASE_URL=postgres://你的用户名@127.0.0.1:5432/myhot
API_BASE_URL=http://127.0.0.1:3001
```

然后：

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web

node --env-file=.env apps/api/src/main.ts          # 接口，3001 端口
node --env-file=.env apps/worker/src/main.ts       # 后台任务
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 网页，3000 端口
```

三个进程要一直运行，生产环境用 systemd 或 pm2 守护。

开发时用带热更新的方式：`npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。开发时想免登录进后台，在 `.env` 里设 `DEV_AUTH_ROLE=admin`（生产环境会拒绝启动）。
