@echo off
setlocal
cd /d "%~dp0..\web"
if not exist node_modules\vite (
  echo Run windows\setup.bat first.
  pause
  exit /b 1
)
echo Start the backend in another terminal before using API features.
call npm.cmd run dev -- --host 127.0.0.1
if errorlevel 1 pause
