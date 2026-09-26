@echo off
rem Ek test chalao:  run-test.cmd test_logic
rem (extension .js mat likhein - sirf tools\ ke andar wala naam)
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

if "%~1"=="" (
  echo Usage: windows-dev\run-test.cmd test_logic
  echo        ^(tools\ ke andar jo test chahiye uska naam^)
  echo Tests ki list: dir /b tools\test_*.js
  exit /b 2
)

if not exist "tools\%~1.js" (
  echo [X] tools\%~1.js nahi mila.
  echo    Available:
  dir /b tools\test_*.js 2>nul
  exit /b 2
)

rem Browser-tests demo server maangte hain - pehle check
call :probe
if errorlevel 1 (
  echo [!] Demo server ^(8021^) nahi chal raha - browser-tests fail honge.
  echo     Alag window mein: windows-dev\serve-demo.cmd
)

set "PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1"
node "tools\%~1.js"
exit /b %errorlevel%

:probe
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:8021/index.html').StatusCode}|out-null" >nul 2>nul
exit /b %errorlevel%
