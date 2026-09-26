@echo off
rem Sab node tests ek ke baad ek. FAIL alag se list hota hai.
rem Note: browser-tests (puppeteer) ke liye pehle serve-demo.cmd chalu karein.
setlocal EnableExtensions DelayedExpansion
set "ROOT=%~dp0.."
cd /d "%ROOT%"
set "PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1"

set /a PASS=0, FAIL=0
set "FAILED="
for %%f in (tools\test_*.js) do (
  echo === %%f
  node "%%f" >nul 2>nul
  if errorlevel 1 (
    set /a FAIL+=1
    set "FAILED=!FAILED! %%~nf"
    echo     [FAIL]
  ) else (
    set /a PASS+=1
    echo     [ok]
  )
)

echo.
echo ============ RESULT: PASS=!PASS!  FAIL=!FAIL! ============
if defined FAILED echo FAILED:!FAILED!
if !FAIL! GTR 0 (exit /b 1) else (exit /b 0)
