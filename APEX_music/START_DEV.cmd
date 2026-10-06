@echo off
title APEX Music - DEV
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Abra DEV.html para testar a demo visual.
  pause
  exit /b 1
)
node "%~dp0DEV_SERVER.cjs" --open --port 39876
if errorlevel 1 pause
