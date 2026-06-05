@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch-haibao-mobile.ps1"
if errorlevel 1 (
  echo.
  echo Launch failed. Please make sure Node.js is installed.
  echo.
)
echo.
pause
