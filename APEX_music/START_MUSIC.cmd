@echo off
where node >nul 2>nul
if errorlevel 1 (
 echo Instale Node.js 22 ou superior para iniciar o audio original.
 pause
 exit /b 1
)
node "%~dp0DEV_SERVER.cjs" --port 39876
if errorlevel 1 pause
