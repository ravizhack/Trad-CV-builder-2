@echo off
title Building Trad CV Builder and Installer...
echo ============================================
echo   1. Building Trad CV Builder.exe
echo ============================================

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set ISCC="%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"

if not exist %CSC% (
    echo Error: C# compiler csc.exe not found!
    pause
    exit /b 1
)

%CSC% /target:winexe /win32icon:app.ico /r:System.Windows.Forms.dll,System.Drawing.dll,System.dll /out:"Trad CV Builder.exe" src\Program.cs

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] "Trad CV Builder.exe" built!
) else (
    echo [ERROR] EXE Build failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   2. Building Setup Installer (.exe)
echo ============================================

if exist %ISCC% (
    %ISCC% installer.iss
    if %ERRORLEVEL% EQU 0 (
        copy /y "dist\Trad_CV_Builder_Setup_v1.0.exe" "Trad_CV_Builder_Setup_v1.0.exe" >nul
        copy /y "dist\Trad_CV_Builder_Setup_v1.0.exe" "%USERPROFILE%\Desktop\Trad_CV_Builder_Setup_v1.0.exe" >nul
        echo.
        echo [SUCCESS] Installer created: Trad_CV_Builder_Setup_v1.0.exe!
    ) else (
        echo [WARNING] Installer build encountered an error.
    )
) else (
    echo [INFO] Inno Setup compiler not found. Skipping installer package.
)

echo.
echo ============================================
echo   All Done!
echo ============================================
pause
