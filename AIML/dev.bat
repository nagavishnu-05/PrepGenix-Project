@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "VENV_PYTHON=%SCRIPT_DIR%.venv\Scripts\python.exe"

if /I "%~1"=="help" goto help
if "%~1"=="" goto help

if /I "%~1"=="setup" (
    if not exist "%VENV_PYTHON%" (
        where py >nul 2>&1
        if not errorlevel 1 (
            py -3.10 -m venv "%SCRIPT_DIR%.venv"
            if errorlevel 1 (
                echo Python 3.10 was not found. Install Python 3.10 and try again.
                exit /b 1
            )
        ) else (
            python -m venv "%SCRIPT_DIR%.venv"
            if errorlevel 1 exit /b 1
        )
    )

    "%VENV_PYTHON%" -m pip install -r "%SCRIPT_DIR%requirements.txt"
    if errorlevel 1 exit /b 1
    exit /b 0
)

if not exist "%VENV_PYTHON%" (
    echo AIML Python environment is not set up yet.
    echo Run: dev.bat setup
    exit /b 1
)

"%VENV_PYTHON%" "%SCRIPT_DIR%run.py" %*
exit /b %errorlevel%

:help
echo.
echo AIML local development
echo.
echo   dev.bat setup            Create the AIML environment and install packages
echo   dev.bat serve            Start the AIML APIs
echo   dev.bat analyze [options] Run the proctoring analyzer
echo   dev.bat parse [options]   Run the resume parser
echo.
echo Run setup once, then use serve each time you work on the project.
echo Press Ctrl+C to stop the APIs.
exit /b 0
