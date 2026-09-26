@echo off
rem EN-purity gates: audit_i18n (report) + i18n floor (regression gate)
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo == audit_i18n ==
node tools\audit_i18n.js
echo.
echo == floor gate ==
node tools\test_i18n_floor.js
exit /b %errorlevel%
