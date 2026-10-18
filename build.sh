#!/usr/bin/env bash
# exit on error
set -o errexit

echo "============================================================"
echo "AutoAgentHire Cloud Build Starting..."
echo "Current Directory: $(pwd)"
echo "Python Version:    $(python --version 2>&1 || true)"
echo "Pip Version:       $(pip --version 2>&1 || true)"
echo "============================================================"

echo "Upgrading pip..."
pip install --upgrade pip

# Locate requirements file (works whether rootDir is '.' or 'backend')
if [ -f "requirements-prod.txt" ]; then
    REQ_FILE="requirements-prod.txt"
elif [ -f "requirements.txt" ]; then
    REQ_FILE="requirements.txt"
elif [ -f "../requirements-prod.txt" ]; then
    REQ_FILE="../requirements-prod.txt"
elif [ -f "../requirements.txt" ]; then
    REQ_FILE="../requirements.txt"
else
    echo "ERROR: Could not locate requirements.txt or requirements-prod.txt"
    exit 1
fi

echo "Installing dependencies from: $REQ_FILE"
pip install -r "$REQ_FILE"

# Determine target data directory
if [ -d "backend" ]; then
    TARGET_DATA_DIR="data"
    TARGET_UPLOADS_DIR="uploads/resumes"
else
    TARGET_DATA_DIR="../data"
    TARGET_UPLOADS_DIR="../uploads/resumes"
fi

echo "Creating required directories..."
mkdir -p "$TARGET_DATA_DIR/logs" \
         "$TARGET_DATA_DIR/resumes" \
         "$TARGET_DATA_DIR/job_listings" \
         "$TARGET_DATA_DIR/cover_letters" \
         "$TARGET_DATA_DIR/screenshots" \
         "$TARGET_DATA_DIR/reports" \
         "$TARGET_DATA_DIR/temp" \
         "$TARGET_DATA_DIR/templates" \
         "$TARGET_DATA_DIR/vectors" \
         "$TARGET_UPLOADS_DIR"

# Install Playwright browser safely (skip if SKIP_PLAYWRIGHT_INSTALL is set or on constrained cloud tiers)
if [ "${SKIP_PLAYWRIGHT_INSTALL:-0}" != "1" ]; then
    if command -v playwright > /dev/null 2>&1; then
        echo "Installing Playwright chromium browser (non-fatal)..."
        playwright install chromium || echo "Playwright browser install skipped (non-fatal on cloud build)"
    fi
else
    echo "Playwright browser installation skipped via SKIP_PLAYWRIGHT_INSTALL=1"
fi


echo "============================================================"
echo "AutoAgentHire Build Completed Successfully!"
echo "============================================================"
