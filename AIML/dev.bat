@echo off
REM AIML Development Runner for Windows
REM Similar to "npm run dev" but for Python

setlocal enabledelayedexpansion

if "%1%"=="" (
    echo.
    echo ============================================
    echo   AIML Interview Assessment Platform
    echo ============================================
    echo.
    echo Usage:
    echo   dev.bat serve       - Start API server
    echo   dev.bat setup       - Install dependencies
    echo   dev.bat analyze     - Run proctoring analyzer
    echo   dev.bat parse       - Run resume parser
    echo   dev.bat help        - Show this help
    echo.
    echo Examples:
    echo   dev.bat serve --port 3001
    echo   dev.bat analyze --image frame.jpg --audio audio.wav
    echo   dev.bat parse --input resume.pdf
    echo.
    exit /b 0
)

if "%1%"=="serve" (
    echo.
    echo [*] Starting AIML API Server...
    python run.py serve %2 %3 %4 %5
    exit /b %errorlevel%
)

if "%1%"=="setup" (
    echo.
    echo [*] Setting up environment...
    python run.py setup
    exit /b %errorlevel%
)

if "%1%"=="analyze" (
    echo.
    echo [*] Running proctoring analyzer...
    python run.py analyze %2 %3 %4 %5
    exit /b %errorlevel%
)

if "%1%"=="parse" (
    echo.
    echo [*] Running resume parser...
    python run.py parse %2 %3 %4 %5
    exit /b %errorlevel%
)

if "%1%"=="help" (
    python run.py --help
    exit /b 0
)

if "%1%"=="dev" (
    echo.
    echo [*] Starting development server...
    python run.py serve %2 %3 %4 %5
    exit /b %errorlevel%
)

echo Unknown command: %1%
echo Use "dev.bat help" for usage information
exit /b 1
