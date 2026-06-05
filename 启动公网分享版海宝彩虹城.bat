@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch-haibao-public.ps1"
if errorlevel 1 (
  echo.
  echo Launch failed. Please check your network and try again.
  echo.
)
echo.
pause
