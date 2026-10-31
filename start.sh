#!/usr/bin/env bash
# 信复通一键启动（Linux / macOS）
set -e
cd "$(cd "$(dirname "$0")" && pwd)"

echo "==> 检查环境"
command -v node >/dev/null || { echo "缺少 Node.js，请先安装 20 或更高版本"; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node 版本过低（当前 $(node -v)），需要 20+"; exit 1; }
command -v python3 >/dev/null && echo "    python3 $(python3 -V 2>&1 | awk '{print $2}')" || echo "    ! 未找到 python3，PDF 导出将不可用"
python3 -c "import reportlab" 2>/dev/null && echo "    reportlab ok" || echo "    ! 缺少 reportlab，运行：pip3 install reportlab"

echo "==> 准备配置"
if [ ! -f .env ]; then
  cp env.example .env
  echo "    已从 env.example 生成 .env，请按需修改数据库账号与 AI 密钥"
fi

echo "==> 检查数据库"
if ! (ss -lptn 2>/dev/null || netstat -lnt 2>/dev/null) | grep -q ':3306'; then
  if [ -x ../database/start-db.sh ]; then
    echo "    3306 未监听，尝试启动项目内置数据库"
    bash ../database/start-db.sh
  else
    echo "    ! 3306 未监听，请先启动 MySQL/MariaDB"; exit 1
  fi
fi

echo "==> 安装依赖"
[ -d node_modules ] || npm install --no-audit --no-fund

echo "==> 构建前端"
if [ ! -f web/dist/index.html ]; then
  (cd web && npm install --no-audit --no-fund && npm run build)
fi

echo "==> 启动服务"
PORT=$(grep -E '^PORT_V2=' .env 2>/dev/null | cut -d= -f2)
PORT=${PORT:-8790}
echo "    打开 http://127.0.0.1:$PORT"
exec node server.js
