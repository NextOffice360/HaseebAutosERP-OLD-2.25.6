@echo off
rem VS Code tasks + settings repo root ke .vscode\ mein copy karta hai
setlocal EnableExtensions
set "ROOT=%~dp0.."
if not exist "%ROOT%\.vscode" mkdir "%ROOT%\.vscode"
copy /y "%~dp0vscode-tasks.json" "%ROOT%\.vscode\tasks.json" >nul
echo [OK] .vscode\tasks.json ready - VS Code mein "Terminal > Run Task" kholein.
exit /b 0
