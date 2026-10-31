@echo off
setlocal
cd /d "%~dp0.."
if not exist .env goto :missing
if not exist node_modules\mysql2 goto :missing
if not exist ".venv\Scripts\python.exe" goto :missing
set "PYTHON=%CD%\.venv\Scripts\python.exe"
if not defined XFT_FONT_DIR set "XFT_FONT_DIR=%WINDIR%\Fonts"
echo Backend: http://127.0.0.1:8790
node server.js
if errorlevel 1 pause
exit /b
:missing
echo Run windows\setup.bat first, then configure .env and MySQL.
pause
exit /b 1
