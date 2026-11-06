# Windows 本地运行（原生 Windows，无需 WSL）

这是现有平台的 Windows 启动适配，不是包含所有运行时的免安装版。第一次安装依赖需要联网。本轮在 Linux 检查代码及构建，尚未在真实 Windows 上执行 BAT 脚本。

## 1. 复制项目

推荐解压源码包到 `D:\xinfutong`，用 VS Code“文件 → 打开文件夹”打开。正确目录里能看到 `package.json`、`server.js`、`web`、`windows`。

若自己复制，复制 app 目录里的源码及锁文件，不要搬 Linux 的 `node_modules`、`web/node_modules`、`.venv`、`.env`、`.git` 或上级 `database/mysql-data`。源码包不包含原数据库记录，新环境会创建虚构演示数据。保留原业务数据需另行导出导入 SQL 和保留原签名密钥，不能直接拷贝 Linux 数据文件。

## 2. 安装运行环境

- Node.js LTS（建议 22 或 24 系列）：https://nodejs.org/en/download
- Python 3（建议 3.11 或 3.12），安装 Python Launcher，确保 `py -3 --version` 可用：https://www.python.org/downloads/windows/
- MySQL Server 8.x，记住管理员密码，将数据库配置为 Windows 服务并启动：https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html

安装后重开 VS Code，终端执行 `node --version`、`npm.cmd --version`、`py -3 --version` 确认可用。

## 3. 建立本机数据库

在 MySQL Workbench 的 SQL 编辑器或 MySQL 命令行，用管理员登录，执行下面语句。把 `YOUR_OWN_DB_PASSWORD` 替换为自己设置的数据库密码：

```sql
CREATE DATABASE IF NOT EXISTS xinfutong_windows
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'xft'@'127.0.0.1' IDENTIFIED BY 'YOUR_OWN_DB_PASSWORD';
GRANT ALL PRIVILEGES ON xinfutong_windows.* TO 'xft'@'127.0.0.1';
```

用户已存在则不重复创建；核实密码，或用管理员执行 `ALTER USER 'xft'@'127.0.0.1' IDENTIFIED BY 'YOUR_OWN_DB_PASSWORD';`。应用会自动建表和迁移，不需要手工执行 schema.sql。数据库服务由 Windows 服务管理，不由启动脚本安装或停止。

## 4. 第一次安装依赖

在 VS Code 终端执行（PowerShell 或 CMD 均可）：

```powershell
.\windows\setup.bat
```

脚本建立 `.venv`、安装 PDF 依赖、按锁文件安装前后端依赖、构建前端，最后创建 `.env` 和随机签名密钥。已有 `.env` 不会被覆盖。

打开根目录 `.env`，将 `DB_PASSWORD=CHANGE_ME` 改为第 3 步的密码。默认数据库名 `xinfutong_windows`、端口 `3306`，端口不同则修改 `DB_PORT`。

`XFT_DEMO_SEED=1` 仅供本机空库创建虚构演示账号和企业；非演示环境设为 0。AI 密钥可留空，仍可通过模板和人工编辑完成材料。登录页不展示账号密码，使用自己保存的账号或注册新企业账号。

## 5. VS Code 分别启动前后端

菜单“终端 → 新建终端”，运行后端：

```powershell
.\windows\start-backend.bat
```

点击终端右侧 **＋** 新建第二个终端，运行前端：

```powershell
.\windows\start-frontend.bat
```

后端默认 `http://127.0.0.1:8790`，前端开发默认 `http://127.0.0.1:5180`。开发时打开前端终端显示的实际网址；前端将 `/api` 转发到 8790。两个终端需保持运行，修改前端自动更新；修改后端需停止后重新启动。调整后端端口须同步修改 `web/vite.config.js` 的代理地址。

也可用 VS Code“终端 → 运行任务”，分别选择 `Windows: backend` 和 `Windows: frontend`。停止服务在对应终端按 Ctrl+C，CMD 如询问终止批处理则输入 Y。

## 6. 只演示时

双击根目录 `start.bat`，或执行：

```powershell
.\windows\start-demo.bat
```

看到启动成功后，浏览器打开 `http://127.0.0.1:8790`，保持窗口打开。此模式后端同时提供构建后的前端，无需启动 5180。修改前端后需重新构建：在 web 目录执行 `npm.cmd run build`，也可重跑 setup.bat（不清空数据库，不覆盖已有配置）。

## 7. 新增的竞赛演示企业

空数据库开启 `XFT_DEMO_SEED=1` 后，初始化数据包含“湘潭新程智能设备有限公司（演示）”。企业演示账号是它的负责人，可编辑档案和事项；园区机构获得它与原企业的协作授权。

示例事项为“特种设备未按期检验（虚构演示事项）”，处罚金额 8 万元、一般裁量阶次，仍在材料准备阶段。它没有官方修复结果或渠道观测，可用于展示从录入、诊断到整理材料的流程。数据均为虚构，演示时无需上传真实企业信息。

已有数据库不会重跑种子，也不应清空重建。公网演示数据库已于 2026-11-02 通过平台业务接口新增这一企业，并配置机构授权。服务器数据与本机数据库相互独立。

## 8. 企业端、机构端、平台运营端怎么演示

三端共用同一个登录页面，由账号角色决定菜单。登录页不放快捷账号。使用各自原有密码；如果没有改过，初始演示密码见你自己保存的账号记录。

| 角色 | 演示账号 | 登录后的入口 | 可以演示什么 |
|---|---|---|---|
| 企业端 | `13907320001` | 工作台、当前企业下拉框 | 切换企业、事项诊断、材料准备、办理进度、渠道核对、企业协作授权 |
| 机构端 | `13907320002` | 左侧“机构工作台”，或 `/app/organization` | 获授权企业、跨企业事项、逾期任务、批量复查、机构成员 |
| 平台运营端 | `18600000000` | 左侧“平台运营”，或 `/app/admin` | 企业与事项统计、适用规则版本、知识内容、规则参数、机构管理、操作审计 |

推荐顺序：

1. 企业账号登录，切换到“湘潭新程智能设备有限公司（演示）”，打开新事项，展示它仍在材料准备阶段，与原企业已经修复的事项作对照。
2. 打开“企业协作授权”，展示已经授予园区的协作权限。手工授权时，企业负责人选择机构、选择“协作”、确认授权；只读权限不能批量复查。
3. 退出登录，使用机构账号登录，点“机构工作台”，搜索新程，查看事项或勾选后“批量复查”。复查结果是否来自模拟器或真实接口，以事项页的渠道来源标识为准。
4. 退出登录，使用运营账号登录，点“平台运营”，依次展示统计、规则参数、机构列表、审计日志。

如果机构端空白，先检查企业有没有授权、机构成员有没有绑定、授权是否撤销；如果看不到对应菜单，检查右上角角色是否为“机构账号”或“平台运营”。只切换企业不会切换账号角色。公开注册默认是企业账号，不能靠注册时填写角色获得运营权限。

多窗口同时展示三端时，使用浏览器的不同用户配置或三个不同浏览器；同一浏览器的普通标签页共享登录 Cookie，会互相切换登录状态。

## 常见问题

- `Access denied`：MySQL 用户、密码或授权与 `.env` 不一致。
- `ECONNREFUSED ...3306`：数据库服务未启动或端口错误。
- `EADDRINUSE ...8790`：已经有后端运行，不要重复启动。
- `py` 找不到：安装 Python 及 Launcher 后重开 VS Code。
- PDF 不可用：确认安装成功，`.venv\Scripts\python.exe -c "import reportlab"` 可执行；启动脚本指定项目 Python 和 Windows 字体目录。
- 不要直接执行 `npm test` 作为 Windows 首次启动步骤；现有集成测试使用 Linux 数据库管理 socket，需要另外适配管理连接。
- 默认仅允许本机访问；手机扫码需另外配置局域网绑定、公开基址及防火墙。AI 需要网络，本地模板和流程不依赖 AI 网络。

第三方及银行接口不会因换到 Windows 自动接通。种子法规和办理示例不是已核验的真实法律依据。
