# AutoAgentHire Backend Launcher (PowerShell)
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting AutoAgentHire FastAPI Backend Server..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$py312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"

if (Test-Path $py312) {
    Write-Host "Using Python 3.12: $py312" -ForegroundColor Green
    & $py312 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
} else {
    Write-Host "Falling back to system python on PATH..." -ForegroundColor Yellow
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
}

