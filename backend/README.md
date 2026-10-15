# AutoAgentHire — Backend

FastAPI backend and Playwright automation engine for AutoAgentHire.

## Tech Stack
- **Framework:** FastAPI (Python 3.11+) + Uvicorn / Gunicorn
- **Automation:** Playwright (Chromium headless/headful)
- **Database:** MongoDB Atlas + SQLite fallback
- **AI / LLM:** GitHub Models, Groq, OpenAI, Google Gemini
- **Security:** JWT authentication (python-jose), bcrypt password hashing

## Directory Structure
```text
backend/
├── routes/             # FastAPI API route controllers
│   ├── auth_routes.py          # User authentication & registration
│   ├── api_routes.py           # Core job matching and profile endpoints
│   ├── v2_routes.py            # Automation task runner & logs
│   ├── ats_routes.py           # ATS resume scanner & scoring
│   ├── cover_letter_routes.py  # AI cover letter generation
│   ├── recruiter_routes.py     # Recruiter search & outreach
│   └── linkedin_jobs_routes.py # LinkedIn jobs search API
├── database/           # SQLAlchemy models and connection manager
│   ├── models_complete.py      # Complete database models
│   └── connection.py           # Database engine & session initialization
├── agents/             # Autonomous agent bots & orchestrator
├── automation/         # Browser automation & form interaction
├── matching/           # Job matching and qualification scoring
├── parsers/            # Resume parsers (PDF, DOCX)
├── rag/                # RAG vector database retrieval (Qdrant / Chroma)
├── utils/              # Helper utilities, tokens, security
├── main.py             # FastAPI entrypoint application
├── config.py           # Pydantic settings & environment configuration
├── playwright_runner.py# Standalone Playwright automation subprocess
└── requirements.txt    # Python dependencies
```

## Getting Started

### 1. Set Up Virtual Environment
From project root:
```bash
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On macOS/Linux:
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r backend/requirements.txt
playwright install chromium
```

### 3. Configure Environment
Copy the example environment file:
```bash
cp backend/.env.example backend/.env
# Or use root .env
```
Ensure you generate a secure `SECRET_KEY`:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Run Backend Server
```bash
# From project root:
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Or from backend directory:
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Interactive API documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
