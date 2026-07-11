@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================
echo       ClassMap Server Launcher (Win)
echo ========================================

:: Check the port before creating or updating the local Python runtime
echo [*] Checking port 5555...
netstat -aon | findstr /C:":5555 " | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    echo [ERROR] Port 5555 is already in use.
    echo Close the application using port 5555, then run this launcher again.
    echo No existing process was terminated.
    pause
    exit /b 1
)

set PYTHON_DIR=%~dp0python_portable
set PYTHON_EXE=%PYTHON_DIR%\python.exe
set PIP_EXE=%PYTHON_DIR%\Scripts\pip.exe

:: 1. Check for Portable Python
if not exist "%PYTHON_EXE%" (
    echo [WARN] Portable Python not found. Setting up environment...
    
    if not exist "%PYTHON_DIR%" mkdir "%PYTHON_DIR%"
    
    echo [*] Downloading Python 3.11.9...
    curl -L -o "%PYTHON_DIR%\python_dist.zip" https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip
    
    echo [*] Extracting Python...
    tar -xf "%PYTHON_DIR%\python_dist.zip" -C "%PYTHON_DIR%"
    del "%PYTHON_DIR%\python_dist.zip"
    
    echo [*] Configuring Python paths...
    :: Enable site-packages in embeddable python
    if exist "%PYTHON_DIR%\python311._pth" (
        powershell -Command "(Get-Content ($env:PYTHON_DIR + '\python311._pth')) -replace '#import site', 'import site' | Set-Content ($env:PYTHON_DIR + '\python311._pth')"
    )
    
    echo [*] Installing Pip...
    curl -L -o "%PYTHON_DIR%\get-pip.py" https://bootstrap.pypa.io/get-pip.py
    "%PYTHON_EXE%" "%PYTHON_DIR%\get-pip.py" --no-warn-script-location
    del "%PYTHON_DIR%\get-pip.py"
)

:: 2. Install/Update Dependencies
echo [*] Checking dependencies...
set MARKER=%PYTHON_DIR%\.requirements.sha256
set NEED_INSTALL=0
"%PYTHON_EXE%" -c "import hashlib,os,sys; h=hashlib.sha256(open('requirements.txt','rb').read()).hexdigest(); mp=os.environ['MARKER']; m=open(mp).read().strip() if os.path.exists(mp) else ''; sys.exit(0 if h==m else 1)"
if errorlevel 1 (
    set NEED_INSTALL=1
)

"%PYTHON_EXE%" -c "import flask, flask_socketio, flask_sqlalchemy, flask_wtf, PIL, openpyxl, simple_websocket, werkzeug" >nul 2>&1
if errorlevel 1 (
    set NEED_INSTALL=1
)

if "!NEED_INSTALL!"=="1" (
    echo [*] Installing/updating packages...
    "%PYTHON_EXE%" -m pip install -r requirements.txt --no-warn-script-location
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
    "%PYTHON_EXE%" -c "import flask, flask_socketio, flask_sqlalchemy, flask_wtf, PIL, openpyxl, simple_websocket, werkzeug" >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Dependencies were installed, but required modules still cannot be imported.
        pause
        exit /b 1
    )
    "%PYTHON_EXE%" -c "import hashlib,os; open(os.environ['MARKER'],'w').write(hashlib.sha256(open('requirements.txt','rb').read()).hexdigest())"
) else (
    echo [*] Dependencies are up to date, skipping install.
)

:: 3. Launch Application
echo [*] Launching Application...
echo ========================================
"%PYTHON_EXE%" run.py

pause
