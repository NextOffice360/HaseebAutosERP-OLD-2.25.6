@echo off
rem ============================================================================
rem HaseebAutosERP - Windows 10/11 64-bit dev setup (ek dafa chalao)
rem - Node 18+, Python 3.10+, Git-Bash check
rem - npm install (PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1)
rem - Chrome for Testing (puppeteer ke liye)
rem ============================================================================
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo == HaseebAutosERP Windows setup ==
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js nahi mila. https://nodejs.org LTS install karein, phir dobara.
  goto :fail
) else (
  for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v
)

where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python nahi mila - sirf build scripts ke liye chahiye ^(python.org^)
) else (
  for /f "delims=" %%v in ('python --version') do echo [OK] %%v
)

where bash >nul 2>nul
if errorlevel 1 (
  echo [X] bash nahi mila - "Git for Windows" install karein ^(verify/package ke liye zaroori^).
  goto :fail
) else (
  echo [OK] bash ^(Git-Bash^) mila
)

rem Chrome headless-shell skip - sandbox wala hi platform rule
set "PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1"
setx PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD 1 >nul 2>nul
echo [OK] PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1 ^(user env^)

echo.
echo == npm install ^(repo root^) ==
call npm install
if errorlevel 1 goto :fail

echo.
echo == Chrome for Testing ^(puppeteer^) ==
where systeminfo >nul 2>nul
call npx --yes @puppeteer/browsers install chrome@stable
if errorlevel 1 echo [!] Chrome install skip hua - agar browser tests chahiye to dobara chalayein.

echo.
echo [DONE] Setup mukammal. Ab "windows-dev\serve-demo.cmd" aur "windows-dev\run-test.cmd test_logic" try karein.
exit /b 0

:fail
echo.
echo [FAIL] Setup adhoora - upar wali line parhein.
exit /b 1
