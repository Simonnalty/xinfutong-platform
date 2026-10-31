# 信复通 v2 · 民营企业信用修复 SaaS 平台

面向民营企业的信用修复自助平台：诊断失信等级 → 生成合规材料 → 跟踪办理进度 → 监测多平台同步 → 生成法律异议函 → 出具可扫码核验的数字凭证。

> 本平台不代办、不承诺结果、不替代行政机关作出决定。演示数据均为构造数据。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Node 20+ / `node:http` + 自建路由，唯一 npm 依赖 `mysql2` |
| 数据库 | MySQL 8 / MariaDB 10.6+，24 张表 |
| 前端 | Vue 3 + Element Plus + Vite（组件化、按角色路由） |
| 文书 | 槽位模板（LOCK/GEN/DER）+ DeepSeek 润色（服务端代理）+ reportlab 生成 PDF |
| 存证 | SHA-256 摘要 + HMAC 签名 + 前序摘要链 |

## 目录

```
app/
├── server.js            装配：静态资源 + API + SPA history 回退
├── src/
│   ├── config.js        配置（.env）
│   ├── db.js            连接池 / 建表 / 种子
│   ├── http.js          JSON、Cookie、静态文件、PDF 输出
│   ├── router.js        正则路由 + 鉴权中间件
│   ├── crypto.js        scrypt 口令、随机 token
│   ├── ai.js            DeepSeek 代理 + 锁定事实校验
│   ├── services/        auth / rules / diagnose / docs / checks / cert
│   └── routes/          auth / workspace / sync / admin
├── db/schema.sql        24 张表
├── db/seed.js           演示数据（6 企业 / 5 案件 / 3 账号）
├── tools/gen_pdf.py     文书与凭证 PDF（reportlab，中文字体）
└── web/                 Vue 3 前端（dist 已构建，可直接跑）
```

## 数据库

本机演示用的 MariaDB 是**便携版**，数据和二进制都放在项目里，方便整体拷走：

| 内容 | 位置 |
| --- | --- |
| 数据文件（158MB，勿提交 git） | `/home/simon/项目/信复通/database/mysql-data` |
| 启动 / 停止脚本 | `database/start-db.sh`、`database/stop-db.sh` |
| 服务端二进制（1.2GB，未纳入项目） | `/home/simon/mariadb` |
| 连接信息 | `127.0.0.1:3306`，库 `xinfutong_v2`，账号 `xft` |

```bash
bash database/start-db.sh    # 启动
bash database/stop-db.sh     # 停止
```

正式部署到云服务器时用系统的 `mariadb-server`，不需要这套便携版。

## 启动

前置：Node 20+、MariaDB/MySQL 已启动（本机用 `database/start-db.sh`）、Python3 + reportlab（PDF 功能需要）。

```bash
cp env.example .env        # 改数据库账号、AI 密钥、签名密钥
npm install
npm start                  # http://127.0.0.1:8790
```

首次启动会自动建表并灌入演示数据（`enterprises` 为空时触发）。

前端二次开发：

```bash
cd web && npm install && npm run dev   # http://127.0.0.1:5180，/api 代理到 8790
npm run build                          # 产物到 web/dist，后端自动服务
```

### 演示账号（密码均为 `xft2026`）

| 手机号 | 角色 | 说明 |
| --- | --- | --- |
| 13907320001 | 企业 | 湖南恒基建材有限公司，1 条轻微失信 |
| 13907320002 | 机构 | 园区服务中心，可批量查看企业 |
| 18600000000 | 运营 | 规则参数、机构、审计日志 |

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 手机号 + 口令，下发 HttpOnly Cookie |
| GET | `/api/enterprises/:id/overview` | 工作台：KPI、失信事项、时间线 |
| GET | `/api/cases/:id` | 案件详情 + 规则判定 + 文书清单 + 渠道 |
| POST | `/api/cases/:id/diagnose` | 重新诊断并落库 |
| GET/POST | `/api/cases/:id/docs[/:key]` | 取/存文书（存后进 case_docs） |
| POST | `/api/cases/:id/docs/:key/polish` | AI 润色（校验锁定事实后落库） |
| POST | `/api/cases/:id/rescan` | 多源渠道巡检，产出差异 |
| POST | `/api/cases/:id/objection` | 生成并发送法律异议函 |
| POST | `/api/cases/:id/certificates` | 签发数字凭证（哈希链 + 签名） |
| GET | `/api/verify/:code` | 公开核验，返回 valid/revoked/tampered |
| GET | `/api/pdf/doc`、`/api/pdf/cert` | 文书 / 凭证 PDF |
| GET | `/api/admin/{rules,orgs,audit,stats}` | 运营后台 |

## 规则参数

`rule_params` 表集中管理法定参数（轻微 3 / 一般 6 / 严重 12 / 特别严重 36 个月、15 个工作日办理时限等），运营后台可直接改，不必改代码。

**这些是演示默认值，正式使用前须由法律专业人员依据现行法规逐条校准。**

## 许可

课程项目，未授权商用。
