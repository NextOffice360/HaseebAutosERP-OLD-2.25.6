@echo off
rem Release zip:  package.cmd 2.31.4   ->  release\haseeb-autos-v2.31.4.zip
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

if "%~1"=="" (
  echo Usage: windows-dev\package.cmd 2.31.4
  exit /b 2
)

bash tools/package.sh %~1
exit /b %errorlevel%
