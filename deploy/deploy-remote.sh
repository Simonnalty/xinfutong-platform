#!/usr/bin/env bash
# 一键发布到线上服务器
#
#   只发前端：  bash deploy/deploy-remote.sh
#   连同后端：  bash deploy/deploy-remote.sh --backend
#   只发后端：  bash deploy/deploy-remote.sh --backend-only
#
# 服务器地址可用环境变量覆盖：HOST=root@1.2.3.4 bash deploy/deploy-remote.sh
set -euo pipefail

HOST="${HOST:-root@47.120.36.30}"
PUBLIC_IP="${HOST#*@}"
APP=/opt/xinfutong
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%H%M)"

MODE=frontend
case "${1:-}" in
  --backend) MODE=both ;;
  --backend-only) MODE=backend ;;
  "") ;;
  *) echo "未知参数：$1"; exit 1 ;;
esac

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

# ---------- 后端 ----------
if [ "$MODE" != "frontend" ]; then
  say "1/5 检查后端语法"
  for f in "$ROOT"/server.js "$ROOT"/src/*.js "$ROOT"/src/services/*.js "$ROOT"/src/routes/*.js; do
    node --check "$f"
  done

  say "2/5 打包并上传后端"
  tar czf /tmp/xft-src.tgz -C "$ROOT" server.js src db tools package.json
  scp /tmp/xft-src.tgz "$HOST:/tmp/xft-src.tgz"

  say "3/5 服务器上替换后端"
  ssh "$HOST" "set -e; cd $APP
    cp -r src /root/src-backup-$STAMP
    tar xzf /tmp/xft-src.tgz
    node --check src/db.js >/dev/null
    echo 后端已替换（旧版备份 /root/src-backup-$STAMP）"
fi

# ---------- 前端 ----------
if [ "$MODE" != "backend" ]; then
  say "构建前端"
  ( cd "$ROOT/web" && node node_modules/vite/bin/vite.js build )

  say "打包并上传前端"
  tar czf /tmp/xft-dist.tgz -C "$ROOT/web/dist" .
  scp /tmp/xft-dist.tgz "$HOST:/tmp/xft-dist.tgz"

  say "服务器上切换前端"
  ssh "$HOST" "set -e; cd $APP
    mv web/dist web/dist-prev-$STAMP
    mkdir -p web/dist
    tar xzf /tmp/xft-dist.tgz -C web/dist
    echo 前端已替换（旧版备份 $APP/web/dist-prev-$STAMP）"
fi

# ---------- 重启与验证 ----------
say "重启服务"
ssh "$HOST" "systemctl restart xinfutong && sleep 5 && systemctl is-active xinfutong"

say "验证"
curl -s -o /dev/null -w "首页      %{http_code}\n" "http://$PUBLIC_IP/"
curl -s "http://$PUBLIC_IP/api/health" && echo
echo "打开 http://$PUBLIC_IP/ 看一眼，控制台不应有红色报错。"

say "回滚命令（出问题时复制执行）"
cat <<EOF
ssh $HOST "cd $APP && cp -r /root/src-backup-$STAMP/. src/ && mv web/dist web/dist-new && mv web/dist-prev-$STAMP web/dist && systemctl restart xinfutong"
EOF
