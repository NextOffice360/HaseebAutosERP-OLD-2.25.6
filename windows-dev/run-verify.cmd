@echo off
rem Full verify (71 gates) - Git-Bash ke through tools\verify.sh
rem Usage: run-verify.cmd 2.31.4     ^(version sirf log-file ke naam ke liye^)
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

set "VER=%~1"
if "%VER%"=="" set "VER=local"

where bash >nul 2>nul
if errorlevel 1 (
  echo [X] bash nahi mila - "Git for Windows" install karein.
  exit /b 2
)

rem HOME -u sandbox rule ka Windows-equivalent: HOME hat kar deterministic hota hai
bash -c "cd \"$ROOT\" && env -u HOME bash tools/verify.sh > tmp/validate-v%VER%.log 2>&1; rc=$?; tail -5 tmp/validate-v%VER%.log; exit $rc"
set "RC=%errorlevel%"

if "%RC%"=="0" (
  echo [DONE] ALL GATES GREEN - log: tmp\validate-v%VER%.log
) else (
  echo [FAIL] GATE FAILED hai - log: tmp\validate-v%VER%.log  ^(rc=%RC%^)
)
exit /b %RC%
