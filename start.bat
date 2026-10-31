@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==^> 检查环境
where node >nul 2>nul || (echo 缺少 Node.js，请先安装 20 或更高版本: https://nodejs.org & pause & exit /b 1)
for /f "delims=" %%v in ('node -p "process.versions.node"') do set NODEV=%%v
echo     Node %NODEV%
where python >nul 2>nul && (echo     Python 已安装) || (echo     ! 未找到 Python，PDF 导出将不可用)

echo ==^> 准备配置
if not exist .env (
  copy env.example .env >nul
  echo     已生成 .env，请修改数据库密码与 AI 密钥后重试
)

echo ==^> 安装依赖
if not exist node_modules call npm install --no-audit --no-fund

echo ==^> 构建前端
if not exist web\dist\index.html (
  pushd web
  call npm install --no-audit --no-fund
  call npm run build
  popd
)

echo ==^> 启动服务
echo     打开 http://127.0.0.1:8790
node server.js
pause
