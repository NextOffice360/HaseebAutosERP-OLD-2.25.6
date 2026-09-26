@echo off
rem Demo server - demo/ folder ko http://localhost:8021 par serve karta hai
rem Tests (puppeteer wale) isi par chalte hain. Band karne ke liye Ctrl+C.
setlocal EnableExtensions
set "ROOT=%~dp0.."

where python >nul 2>nul
if errorlevel 1 goto :nodefallback

echo Demo: http://localhost:8021/index.html  ^(Ctrl+C = band^)
python -m http.server 8021 --bind 127.0.0.1 --directory "%ROOT%\demo"
exit /b %errorlevel%

:nodefallback
echo [!] Python nahi - node http-server fallback ^(pehli dafa download hoga^)
call npx --yes http-server "%ROOT%\demo" -p 8021 -a 127.0.0.1 -c-1
exit /b %errorlevel%
