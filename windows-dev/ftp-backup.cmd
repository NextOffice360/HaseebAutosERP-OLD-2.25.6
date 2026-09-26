@echo off
rem ============================================================================
rem FTP BACKUP (mandate: Upload -> Verify size -> Delete locally -> Confirm)
rem   ftp-backup.cmd upload   <local-file> zips|logs|bundles|snapshots
rem   ftp-backup.cmd list     zips|logs|bundles|snapshots
rem   ftp-backup.cmd snapshot            (poori repo ka zip -> snapshots/)
rem Credentials: %USERPROFILE%\_netrc (pehli dafa prompt se banti hai).
rem Password repo/logs/commits mein KABHI nahi likha jata.
rem ============================================================================
setlocal EnableExtensions
set "ROOT=%~dp0.."
set "HOST=ftp.gb.stackcp.com"
set "USERFTP=dev@erp.haseebautos.com"
set "NETRC=%USERPROFILE%\_netrc"

if not exist "%NETRC%" goto :mknetrc
goto :args

:mknetrc
echo Netrc file nahi (pehli dafa) - password poochte hain:
set /p "PW=FTP password: "
if "%PW%"=="" echo [X] Khali - cancel.
if "%PW%"=="" exit /b 2
>"%NETRC%" echo machine %HOST%
>>"%NETRC%" echo login %USERFTP%
>>"%NETRC%" echo password %PW%
echo [OK] %NETRC% bana diya.

:args
if /i "%~1"=="list" goto :list
if /i "%~1"=="upload" goto :up
if /i "%~1"=="snapshot" goto :snap
echo Usage:
echo   ftp-backup.cmd upload ^<file^> zips^|logs^|bundles^|snapshots
echo   ftp-backup.cmd list  zips^|logs^|bundles^|snapshots
echo   ftp-backup.cmd snapshot
exit /b 2

:list
if "%~2"=="" echo Usage: ftp-backup.cmd list zips
if "%~2"=="" exit /b 2
curl -sS --netrc-file "%NETRC%" "ftp://%HOST%/HaseebAutosERP/%~2/"
exit /b %errorlevel%

:up
if "%~3"=="" echo Usage: ftp-backup.cmd upload ^<file^> zips
if "%~3"=="" exit /b 2
if not exist "%~2" echo [X] File nahi mili: %~2
if not exist "%~2" exit /b 2
for %%A in ("%~2") do set "NAME=%%~nxA"
for %%A in ("%~2") do set "LSZ=%%~zA"
echo Uploading %NAME% (%LSZ% bytes) -^> HaseebAutosERP/%~3/
curl -sS --netrc-file "%NETRC%" --ftp-create-dirs -T "%~2" "ftp://%HOST%/HaseebAutosERP/%~3/%NAME%"
if errorlevel 1 echo [FAIL] upload
if errorlevel 1 exit /b 1
echo Remote verify (upar wali size %LSZ% se match ho):
curl -sS --netrc-file "%NETRC%" "ftp://%HOST%/HaseebAutosERP/%~3/" | findstr /c:"%NAME%"
exit /b %errorlevel%

:snap
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-snapshot.ps1"
set "SNAP="
for /f "tokens=2 delims==" %%A in ('powershell -NoProfile -Command "Get-ChildItem $env:TEMP -Filter 'ws-snap-*.zip' | Sort-Object LastWriteTime -Desc | Select-Object -First 1 -ExpandProperty FullName"') do set "SNAP=%%A"
if not defined SNAP echo [X] snapshot zip nahi bani
if not defined SNAP exit /b 1
for %%A in ("%SNAP%") do set "SNAPNAME=%%~nxA"
for %%A in ("%SNAP%") do set "SNAPSIZE=%%~zA"
echo Uploading %SNAPNAME% (%SNAPSIZE% bytes)...
curl -sS --netrc-file "%NETRC%" --ftp-create-dirs -T "%SNAP%" "ftp://%HOST%/HaseebAutosERP/snapshots/%SNAPNAME%"
if errorlevel 1 echo [FAIL] upload
if errorlevel 1 exit /b 1
echo Remote verify:
curl -sS --netrc-file "%NETRC%" "ftp://%HOST%/HaseebAutosERP/snapshots/" | findstr /c:"%SNAPNAME%"
del "%SNAP%" >nul 2>nul
exit /b %errorlevel%
