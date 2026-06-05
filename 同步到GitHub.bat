@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sync-haibao-github.ps1"
if errorlevel 1 (
  echo.
  echo GitHub sync failed. Please check the message above and try again.
  echo.
)
echo.
pause
