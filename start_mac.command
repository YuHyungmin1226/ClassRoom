#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "      ClassMap Server Launcher"
echo "========================================"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null
then
    echo "❌ Error: Python 3 is not installed or not found."
    echo "Please install Python 3 from python.org to continue."
    echo "Press any key to exit..."
    read -n 1 -s
    exit 1
fi

# Check the port before creating or updating the virtual environment
echo "Checking port 5555..."
PORT_IN_USE=0
if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:5555 -sTCP:LISTEN -t 2>/dev/null | grep -q .; then
        PORT_IN_USE=1
    fi
elif command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | awk '$4 ~ /:5555$/ { found=1 } END { exit !found }'; then
        PORT_IN_USE=1
    fi
else
    if python3 -c "import socket,sys; s=socket.socket(); s.settimeout(0.2); sys.exit(0 if s.connect_ex(('127.0.0.1', 5555)) == 0 else 1)"; then
        PORT_IN_USE=1
    fi
fi

if [ "$PORT_IN_USE" = "1" ]; then
    echo "Error: Port 5555 is already in use."
    echo "Close the application using port 5555, then run this launcher again."
    echo "No existing process was terminated."
    exit 1
fi

# Create/Verify virtual environment
VENV_DIR="venv"
VENV_ACTIVATE="$VENV_DIR/bin/activate"
if [ ! -d "$VENV_DIR" ] || [ ! -x "$VENV_DIR/bin/python3" ] || [ ! -f "$VENV_ACTIVATE" ]; then
    # 폴더는 있지만 activate/python3가 없는 경우(생성 중 중단됨, 수동 삭제 등)도 첫 생성과
    # 동일하게 처리 — 그렇지 않으면 아래 의존성 설치가 매번 원인 불명으로 실패를 반복한다.
    echo "📦 Initializing virtual environment (first run only)..."
    python3 -m venv "$VENV_DIR"
else
    # Check if the venv was moved (internal paths in venv/bin/activate are absolute)
    # If the path in 'activate' doesn't match the current directory, re-run venv to fix it
    VENV_STORED_PATH=$(grep "VIRTUAL_ENV=" "$VENV_ACTIVATE" | cut -d'"' -f2)
    VENV_ACTUAL_PATH="$(pwd)/$VENV_DIR"
    if [ "$VENV_STORED_PATH" != "$VENV_ACTUAL_PATH" ]; then
        echo "🔄 Project moved. Updating virtual environment..."
        python3 -m venv "$VENV_DIR"
    fi
fi

# Define paths to venv binaries directly (more robust than 'source')
VENV_PYTHON="./$VENV_DIR/bin/python3"
VENV_PIP="./$VENV_DIR/bin/pip"

# Install requirements when requirements.txt changes or required modules are missing
echo "🔄 Checking dependencies..."
if [ ! -f "requirements.txt" ]; then
    echo "❌ Error: requirements.txt not found."
    echo "Press any key to exit..."
    read -n 1 -s
    exit 1
fi
MARKER="$VENV_DIR/.requirements.sha256"
CURRENT_HASH=$("$VENV_PYTHON" -c "import hashlib; print(hashlib.sha256(open('requirements.txt','rb').read()).hexdigest())")
SAVED_HASH=""
[ -f "$MARKER" ] && SAVED_HASH=$(cat "$MARKER")
NEED_INSTALL=0
if [ "$CURRENT_HASH" != "$SAVED_HASH" ]; then
    NEED_INSTALL=1
fi

"$VENV_PYTHON" -c "import flask, flask_socketio, flask_sqlalchemy, flask_wtf, PIL, openpyxl, simple_websocket, werkzeug" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" = "1" ]; then
    echo "📦 Installing/updating dependencies..."
    "$VENV_PIP" install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "❌ Dependency installation failed."
        echo "Press any key to exit..."
        read -n 1 -s
        exit 1
    fi
    "$VENV_PYTHON" -c "import flask, flask_socketio, flask_sqlalchemy, flask_wtf, PIL, openpyxl, simple_websocket, werkzeug" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "❌ Dependencies were installed, but required modules still cannot be imported."
        echo "Press any key to exit..."
        read -n 1 -s
        exit 1
    fi
    echo "$CURRENT_HASH" > "$MARKER"
else
    echo "✅ Dependencies are up to date."
fi

# Run the application
echo "🚀 Launching Application..."
"$VENV_PYTHON" run.py

