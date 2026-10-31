@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto :node_missing
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 goto :failed
)
".venv\Scripts\python.exe" -m pip install -r tools\requirements.txt
if errorlevel 1 goto :failed
call npm.cmd ci
if errorlevel 1 goto :failed
pushd web
call npm.cmd ci
if errorlevel 1 goto :web_failed
call npm.cmd run build
if errorlevel 1 goto :web_failed
popd
node tools\windows-config.js
if errorlevel 1 goto :failed
echo.
echo Setup finished. Configure MySQL and .env using windows\README.md.
echo Then run windows\start-demo.bat.
pause
exit /b 0
:web_failed
popd
goto :failed
:node_missing
echo Install Node.js LTS first, then reopen VS Code.
:failed
echo Setup failed. Check the message above. No database was reset.
pause
exit /b 1
