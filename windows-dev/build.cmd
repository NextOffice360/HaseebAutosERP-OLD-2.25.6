@echo off
rem Demo + static build + syntax check
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo == build_demo ==
python tools\build_demo.py
if errorlevel 1 exit /b 1

echo == build_static ==
python tools\build_static.py
if errorlevel 1 exit /b 1

echo == check.sh ^(Git-Bash^) ==
bash tools/check.sh
exit /b %errorlevel%
