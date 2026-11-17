# ==============================================================================
# AutoAgentHire - Automated Production and Development Launcher (Windows PowerShell)
# ==============================================================================
# 1. Navigates to project root.
# 2. Selects Python 3.12 / 3.11 (avoiding experimental Python 3.14 alpha global).
# 3. Ensures isolated virtual environment (.venv) exists.
# 4. Activates virtual environment in session.
# 5. Detects dependency health before starting (zero-delay boot if already valid).
# 6. Installs or upgrades dependencies from requirements.txt if needed.
# 7. Verifies port 8000 availability.
# 8. Launches FastAPI server via Uvicorn (main:app).
# ==============================================================================

[CmdletBinding()]
param (
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$NoReload,
    [switch]$ForceInstall,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
Set-Location $ProjectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " AutoAgentHire - Intelligent Career and Recruitment Automation Platform" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

# -- 1. Locate Compatible Python Base Interpreter -----------------------------
function Find-CompatiblePython {
    # 1. Existing virtual environments
    $localVenv = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
    if (Test-Path $localVenv) {
        $vOutput = & $localVenv -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($vOutput -in "3.11", "3.12") {
            return $localVenv
        }
    }
    
    $backendVenv = Join-Path $ProjectRoot "backend\venv\Scripts\python.exe"
    if (Test-Path $backendVenv) {
        $vOutput = & $backendVenv -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($vOutput -in "3.11", "3.12") {
            return $backendVenv
        }
    }

    # 2. Known Windows Python 3.12 and 3.11 paths
    $candidatePaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe"
    )

    foreach ($path in $candidatePaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    # 3. Windows Python Launcher py
    $pyCmd = Get-Command "py" -ErrorAction SilentlyContinue
    if ($pyCmd) {
        $py312 = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($py312 -and (Test-Path $py312)) { return $py312 }
        $py311 = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($py311 -and (Test-Path $py311)) { return $py311 }
    }

    # 4. Fallback to system python
    $sysPython = Get-Command "python" -ErrorAction SilentlyContinue
    if ($sysPython) {
        $vOutput = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($vOutput -in "3.11", "3.12") {
            return $sysPython.Source
        } elseif ($vOutput -match "^3\.14") {
            Write-Warning "Global python is Python 3.14 (experimental pre-release). Python 3.12 is required."
        }
    }

    return $null
}

# -- 2. Initialize or Validate Virtual Environment ----------------------------
$VenvDir = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"
$VenvUvicorn = Join-Path $VenvDir "Scripts\uvicorn.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "`n[VENV] Virtual environment (.venv) not found. Initializing..." -ForegroundColor Yellow
    $BasePython = Find-CompatiblePython
    if (-not $BasePython) {
        Write-Error "No compatible Python 3.11 or 3.12 installation detected. Please install Python 3.12 from python.org."
        exit 1
    }

    Write-Host "[VENV] Using Base Python: $BasePython" -ForegroundColor Green
    & $BasePython -m venv $VenvDir
    if (-not (Test-Path $VenvPython)) {
        Write-Error "Failed to create virtual environment at $VenvDir."
        exit 1
    }
    Write-Host "[VENV] Virtual environment successfully created at .venv" -ForegroundColor Green
}

# -- 3. Activate Virtual Environment for Session ------------------------------
$env:VIRTUAL_ENV = $VenvDir
$env:PATH = "$VenvDir\Scripts;" + $env:PATH
Write-Host "[ENV] Active Python: $VenvPython" -ForegroundColor Gray

# -- 4. Health Check and Dependency Verification ------------------------------
$CheckScript = Join-Path $ProjectRoot "backend\check_dependencies.py"
$NeedsInstall = $ForceInstall

if (-not $NeedsInstall) {
    & $VenvPython $CheckScript --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[DEP] Missing or incomplete dependencies detected. Installation required." -ForegroundColor Yellow
        $NeedsInstall = $true
    } else {
        Write-Host "[DEP] All required dependencies are verified and ready." -ForegroundColor Green
    }
}

if ($NeedsInstall) {
    Write-Host "[DEP] Upgrading pip and installing declared dependencies from requirements.txt..." -ForegroundColor Cyan
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r (Join-Path $ProjectRoot "requirements.txt")

    # Run full diagnostics output
    Write-Host "`n[DEP] Re-running dependency diagnostics..." -ForegroundColor Cyan
    & $VenvPython $CheckScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Dependency check failed after installation. Please inspect the errors above."
        exit 1
    }
}

# -- 5. Ensure Data Directory and Port Availability ---------------------------
$DataDir = Join-Path $ProjectRoot "data"
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

$PortInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
if ($PortInUse) {
    $procId = $PortInUse[0].OwningProcess
    Write-Warning "Port $Port is already in use by process ID $procId."
    Write-Host "Terminating orphaned process on port $Port..." -ForegroundColor Yellow
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

if ($DryRun) {
    Write-Host "`n[DRY RUN] Environment, Python, virtual environment, and all dependencies verified successfully." -ForegroundColor Green
    Write-Host "[DRY RUN] Backend is ready to launch via: .\start_autoagenthire.ps1" -ForegroundColor Cyan
    exit 0
}

# -- 6. Start FastAPI Application via Uvicorn --------------------------------
$ReloadFlag = if ($NoReload) { @() } else { @("--reload", "--reload-dir", "backend", "--reload-exclude", "*.db*", "--reload-exclude", "data/*", "--reload-exclude", "uploads/*", "--reload-exclude", "frontend/*") }

Write-Host "`n============================================================================" -ForegroundColor Green
Write-Host " Starting AutoAgentHire Backend on http://${HostAddress}:${Port}" -ForegroundColor Green
Write-Host " Swagger Docs available at: http://${HostAddress}:${Port}/docs" -ForegroundColor Green
Write-Host " Press CTRL+C to stop the server" -ForegroundColor Gray
Write-Host "============================================================================`n" -ForegroundColor Green

& $VenvPython -m uvicorn main:app --host $HostAddress --port $Port @ReloadFlag
