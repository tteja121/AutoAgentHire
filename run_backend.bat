@echo off
echo ========================================================
echo Starting AutoAgentHire FastAPI Backend Server...
echo ========================================================

set "PY312=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

if exist "%PY312%" (
    echo Using Python 3.12: %PY312%
    "%PY312%" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    echo Python 3.12 path not detected, falling back to system python...
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
)

pause

