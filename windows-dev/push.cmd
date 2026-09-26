@echo off
rem Git push - token SIRF prompt se lega (repo/logs mein kabhi nahi likhte)
rem Rule: GITHUB_TOKEN env -> tools\git_push.sh
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

if defined GITHUB_TOKEN goto :have

set /p "TOK=GitHub token (ghp_...): "
if "%TOK%"=="" echo [X] Token khali - cancel. & exit /b 2
set "GITHUB_TOKEN=%TOK%"

:have
bash tools/git_push.sh
exit /b %errorlevel%
