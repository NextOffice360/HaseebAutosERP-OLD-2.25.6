@echo off
rem Syntax check - .gs files + HTML script blocks (bash tools/check.sh)
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"
bash tools/check.sh
exit /b %errorlevel%
