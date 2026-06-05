@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deploy-haibao-cloudflare-pages.ps1"
if errorlevel 1 (
  echo.
  echo Deploy failed. Please check the message above and try again.
  echo.
)
echo.
pause
