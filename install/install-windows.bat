@echo off
setlocal
rem SFX Browser installer for Windows. Double-click this file from the unzipped download.

echo === SFX Browser installer ===
echo.

set "SRC=%~dp0sfx-browser"
set "DEST_DIR=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_DIR%\sfx-browser"

if not exist "%SRC%\CSXS\manifest.xml" (
  echo Could not find the panel files. Make sure you unzipped the whole download
  echo and run this file from inside the unzipped folder.
  goto :end
)

rem 1. Allow unsigned extensions (Premiere 2022-2024 use CSXS 11, 2025+ use CSXS 12).
for %%v in (10 11 12 13) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)
echo [OK] Allowed unsigned extensions

rem 2. Copy the panel into the extensions folder (replacing an older version).
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
if exist "%DEST%" (
  rem A link (developer install) or empty folder is removed by plain rmdir; otherwise remove the copy.
  rmdir "%DEST%" 2>nul
  if exist "%DEST%" rmdir /s /q "%DEST%"
)
xcopy "%SRC%" "%DEST%\" /e /i /q /y >nul
if errorlevel 1 (
  echo Copy failed. Is Premiere Pro open? Close it and run this again.
  goto :end
)
echo [OK] Installed to: %DEST%

echo.
echo Done! Close Premiere Pro completely, reopen it, then go to
echo Window ^> Extensions ^> SFX Browser.

:end
echo.
pause
