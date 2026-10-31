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

## 常见问题

- `Access denied`：MySQL 用户、密码或授权与 `.env` 不一致。
- `ECONNREFUSED ...3306`：数据库服务未启动或端口错误。
- `EADDRINUSE ...8790`：已经有后端运行，不要重复启动。
- `py` 找不到：安装 Python 及 Launcher 后重开 VS Code。
- PDF 不可用：确认安装成功，`.venv\Scripts\python.exe -c "import reportlab"` 可执行；启动脚本指定项目 Python 和 Windows 字体目录。
- 不要直接执行 `npm test` 作为 Windows 首次启动步骤；现有集成测试使用 Linux 数据库管理 socket，需要另外适配管理连接。
- 默认仅允许本机访问；手机扫码需另外配置局域网绑定、公开基址及防火墙。AI 需要网络，本地模板和流程不依赖 AI 网络。

第三方及银行接口不会因换到 Windows 自动接通。种子法规和办理示例不是已核验的真实法律依据。
