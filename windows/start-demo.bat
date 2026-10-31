@echo off
setlocal
cd /d "%~dp0.."
if not exist web\dist\index.html (
  echo Run windows\setup.bat first to build the frontend.
  pause
  exit /b 1
)
echo After the server starts, open http://127.0.0.1:8790 in your browser.
call windows\start-backend.bat
