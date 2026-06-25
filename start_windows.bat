@echo off
setlocal enabledelayedexpansion

echo ========================================
echo       ClassMap Server Launcher (Win)
echo ========================================

set PYTHON_DIR=%~dp0python_portable
set PYTHON_EXE=%PYTHON_DIR%\python.exe
set PIP_EXE=%PYTHON_DIR%\Scripts\pip.exe

:: 1. Check for Portable Python
if not exist "%PYTHON_EXE%" (
    echo [!] Portable Python not found. Setting up environment...
    
    if not exist "%PYTHON_DIR%" mkdir "%PYTHON_DIR%"
    
    echo [*] Downloading Python 3.11.9...
    curl -L -o "%PYTHON_DIR%\python_dist.zip" https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip
    
    echo [*] Extracting Python...
    tar -xf "%PYTHON_DIR%\python_dist.zip" -C "%PYTHON_DIR%"
    del "%PYTHON_DIR%\python_dist.zip"
    
    echo [*] Configuring Python paths...
    :: Enable site-packages in embeddable python
    if exist "%PYTHON_DIR%\python311._pth" (
        powershell -Command "(Get-Content '%PYTHON_DIR%\python311._pth') -replace '#import site', 'import site' | Set-Content '%PYTHON_DIR%\python311._pth'"
    )
    
    echo [*] Installing Pip...
    curl -L -o "%PYTHON_DIR%\get-pip.py" https://bootstrap.pypa.io/get-pip.py
    "%PYTHON_EXE%" "%PYTHON_DIR%\get-pip.py" --no-warn-script-location
    del "%PYTHON_DIR%\get-pip.py"
)

:: 2. Install/Update Dependencies (only when requirements.txt changes)
echo [*] Checking dependencies...
set MARKER=%PYTHON_DIR%\.requirements.sha256
"%PYTHON_EXE%" -c "import hashlib,os,sys; h=hashlib.sha256(open('requirements.txt','rb').read()).hexdigest(); m=open(r'%MARKER%').read().strip() if os.path.exists(r'%MARKER%') else ''; sys.exit(0 if h==m else 1)"
if errorlevel 1 (
    echo [*] Installing/updating packages...
    "%PYTHON_EXE%" -m pip install -r requirements.txt --quiet --no-warn-script-location
    "%PYTHON_EXE%" -c "import hashlib; open(r'%MARKER%','w').write(hashlib.sha256(open('requirements.txt','rb').read()).hexdigest())"
) else (
    echo [*] Dependencies are up to date, skipping install.
)

:: 3. Cleanup Port 5555
echo [*] Cleaning up port 5555...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5555 ^| findstr LISTENING') do (
    echo [!] Killing process %%a using port 5555...
    taskkill /f /pid %%a >nul 2>&1
)

:: 4. Launch Application
echo [*] Launching Application...
echo ========================================
"%PYTHON_EXE%" run.py

pause
