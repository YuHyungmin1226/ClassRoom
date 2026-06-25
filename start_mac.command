#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "      ClassMap Server Launcher"
echo "========================================"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null
then
    echo "Error: Python 3 is not installed or not found."
    echo "Please install Python 3 from python.org to continue."
    echo "Press any key to exit..."
    read -n 1 -s
    exit 1
fi

# Create/Verify virtual environment
VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Initializing virtual environment (first run only)..."
    python3 -m venv "$VENV_DIR"
else
    # Check if the venv was moved (internal paths in venv/bin/activate are absolute)
    # If the path in 'activate' doesn't match the current directory, re-run venv to fix it
    VENV_ACTIVATE="$VENV_DIR/bin/activate"
    if [ -f "$VENV_ACTIVATE" ]; then
        VENV_STORED_PATH=$(grep "VIRTUAL_ENV=" "$VENV_ACTIVATE" | cut -d'"' -f2)
        VENV_ACTUAL_PATH="$(pwd)/$VENV_DIR"
        if [ "$VENV_STORED_PATH" != "$VENV_ACTUAL_PATH" ]; then
            echo "Project moved. Updating virtual environment..."
            python3 -m venv "$VENV_DIR"
        fi
    fi
fi

# Define paths to venv binaries directly (more robust than 'source')
VENV_PYTHON="./$VENV_DIR/bin/python3"
VENV_PIP="./$VENV_DIR/bin/pip"

# Install requirements quietly
echo "Checking and installing dependencies..."
$VENV_PIP install -r requirements.txt > /dev/null 2>&1

# Attempt to stop any existing ghost process running on port 5555
echo "Cleaning up port 5555..."
lsof -t -i :5555 | xargs -I {} kill -9 {} 2>/dev/null || true

# Run the application
echo "Launching Application..."
$VENV_PYTHON run.py

