@echo off
setlocal
rem SFX Browser installer for Windows. Double-click this file from the unzipped download.
rem If the panel files aren't next to it (e.g. it was run from inside the zip without
rem extracting), it downloads the latest release from GitHub instead.

echo === SFX Browser installer ===
echo.

set "HERE=%~dp0"
set "DEST_DIR=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_DIR%\sfx-browser"
set "SFXTMP="

rem 1. Find the panel files: next to this file, or one folder deeper (zip extracted into its own folder).
set "SRC=%HERE%sfx-browser"
if exist "%SRC%\CSXS\manifest.xml" goto :found
set "SRC=%HERE%SFX-Browser\sfx-browser"
if exist "%SRC%\CSXS\manifest.xml" goto :found

echo The panel files are not next to this installer:
echo   "%HERE%"
echo This happens when the installer is opened from inside the zip without extracting it.
echo Downloading the latest version from GitHub instead...
echo.
set "SFXTMP=%TEMP%\sfx-browser-install-%RANDOM%"
mkdir "%SFXTMP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $zip=Join-Path $env:SFXTMP 'SFX-Browser.zip'; Invoke-WebRequest -UseBasicParsing 'https://github.com/bishrut123/premiere-sfx-browser/releases/latest/download/SFX-Browser.zip' -OutFile $zip; Expand-Archive -Force $zip $env:SFXTMP"
set "SRC=%SFXTMP%\SFX-Browser\sfx-browser"
if exist "%SRC%\CSXS\manifest.xml" goto :found

echo.
echo Could not download the panel files.
echo Please right-click SFX-Browser.zip, choose "Extract All...", then open the
echo extracted folder and double-click install-windows.bat from there.
goto :end

:found
rem 2. Allow unsigned extensions (Premiere 2022-2024 use CSXS 11, 2025+ use CSXS 12).
for %%v in (10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo [OK] Allowed unsigned extensions

rem 3. Copy the panel into the extensions folder, replacing an older version.
rem    Plain rmdir removes a link or empty folder; rmdir /s removes a previous copy.
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
if exist "%DEST%" rmdir "%DEST%" 2>nul
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /e /i /q /y >nul
if errorlevel 1 goto :copyfail
echo [OK] Installed to: "%DEST%"

echo.
echo Done! Close Premiere Pro completely, reopen it, then go to
echo Window ^> Extensions ^> SFX Browser.
goto :end

:copyfail
echo Copy failed. Is Premiere Pro open? Close it and run this again.

:end
if defined SFXTMP rmdir /s /q "%SFXTMP%" 2>nul
echo.
pause
