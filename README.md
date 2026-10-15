🚀 AutoAgent Hire – LinkedIn Job Automation with AI

Autonomous AI agent that discovers, fills, and submits LinkedIn Easy Apply jobs intelligently on your behalf.

🌟 Quick Overview

AutoAgent Hire is a full-stack AI automation system that:

Logs into LinkedIn using a persistent browser profile

Finds Easy Apply jobs based on keywords & location

Fills multi-step application forms automatically

Uses AI to answer unknown/custom fields

Uploads resume dynamically

Submits applications (or runs in dry-run mode)

Tracks results in real-time

Stores user profiles securely in MongoDB Atlas

Built with FastAPI, Playwright, React, MongoDB Atlas, and modern AI APIs.

🏗 Architecture
+---------------------------------------------------------+
|                    USER BROWSER                         |
|     React + Vite + TypeScript (Frontend - Vercel)      |
+---------------------------------------------------------+
                          | HTTP REST
+---------------------------------------------------------+
|                 FastAPI Backend (Render)                |
|                                                         |
|  +-------------+  +-------------+  +----------------+  |
|  |  Auth (JWT) |  | Automation  |  |   AI Engine    |  |
|  | bcrypt      |  | Playwright  |  | Multi-provider |  |
|  +-------------+  +-------------+  +----------------+  |
|                                                         |
|   MongoDB Atlas / SQLite    AI Providers (Cloud APIs)  |
+---------------------------------------------------------+
🧠 Core Features
🤖 AI-Powered Form Filling

Automatically fills known fields from user profile

Uses AI fallback for unknown/custom fields

AI called only once per unique label

Smart provider detection:

GitHub Models (preferred)

Groq (fallback)

OpenAI (final fallback)

🔄 Multi-Step Easy Apply Engine

Handles unlimited form pages

Smart Next / Review / Submit detection

Validation error re-check

Resume upload support

Safe exit if form gets stuck

🧾 Resume Intelligence

Parses PDF/DOCX

Extracts:

Skills

Experience

Education

Summary

Used for:

Field prefill

AI contextual answers

Job matching

🛡 FieldTracker Protection

Prevents duplicate field filling

Prevents infinite loops

Prevents repeated AI calls

Each field processed once

🧑‍💻 Full Authentication System

Signup / Login

JWT authentication

Password hashing using bcrypt

User profile stored in PostgreSQL

⚡ Performance Optimizations

Headless Chromium

Explicit waits (no sleep-based logic)

Field deduplication

AI caching

Subprocess-based automation isolation

📁 Project Structure
LinkedIn-Job-Automation-with-AI/
│
├── backend/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   └── logging.py
│   ├── database/
│   │   ├── session.py
│   │   ├── models.py
│   │   └── crud.py
│   ├── routes/
│   │   ├── auth_routes.py
│   │   └── automation_routes.py
│   ├── automation/
│   │   ├── playwright_runner.py
│   │   ├── field_mapper.py
│   │   └── field_tracker.py
│   ├── llm/
│   │   ├── provider_manager.py
│   │   └── ai_fallback.py
│   ├── parsers/
│   │   └── resume_parser.py
│   ├── rag/
│   └── utils/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── lib/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
│
├── scripts/
├── docker/
├── uploads/        (gitignored)
├── data/           (gitignored)
├── requirements.txt
├── render.yaml
├── Procfile
├── .env.example
└── README.md
🔄 Automation Flow
1. User fills profile in React UI
2. POST /api/v2/start-automation
3. Backend spawns Playwright subprocess
4. Browser:
    - Searches Easy Apply jobs
    - Loops through job cards
    - Fills known fields
    - AI handles unknown fields
    - Uploads resume
    - Clicks Next → Submit
5. Frontend polls status
6. Results stored in PostgreSQL
🧩 AI Field Handling Logic

For unknown form fields:

Extract label + context

Send to AI provider

Receive short relevant answer

Cache result

Fill once

Skip if AI returns nothing

AI is never called more than once per label.

🛠 Local Development
Requirements

Python 3.11+

Node.js 18+

MongoDB Atlas (or local SQLite)

Setup
1️⃣ Clone Repository
git clone https://github.com/yourusername/LinkedIn-Job-Automation-with-AI.git
cd LinkedIn-Job-Automation-with-AI
2️⃣ Backend Setup
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
playwright install chromium
3️⃣ Environment Variables

Copy .env.example → .env

# LinkedIn
LINKEDIN_EMAIL=
LINKEDIN_PASSWORD=

# AI
GITHUB_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Auth
SECRET_KEY=your-32-char-secret

# Defaults
JOB_KEYWORDS=Software Engineer
JOB_LOCATION=India
MAX_APPLICATIONS=5
TEST_MODE=true
4️⃣ Run Backend
uvicorn backend.main:app --reload --port 8000

Swagger:

http://localhost:8000/docs
5️⃣ Frontend
cd frontend
npm install
npm run dev

Open:

http://localhost:8080
🚀 Deployment
Backend → Render

Push repo to GitHub

Create new Web Service on Render

Connect repository

Add environment variables in Render dashboard:

DATABASE_URL

SECRET_KEY

LINKEDIN_EMAIL

LINKEDIN_PASSWORD

AI keys

CORS_ORIGINS

Backend URL:

https://your-backend.onrender.com
Frontend → Vercel

Import project in Vercel

Set root directory: frontend

Add:

VITE_API_URL=https://your-backend.onrender.com

Deploy.

🔐 Security Notes

All secrets stored in environment variables

.env never committed

JWT expiration enabled

Passwords hashed with bcrypt

No hardcoded credentials

Browser runs isolated subprocess

⚠ Limitations

LinkedIn UI changes may break selectors

CAPTCHA may require manual solve

High-volume automation may trigger security checks

Intended for educational/demo use

📊 API Endpoints
Method	Endpoint	Description
GET	/health	Health check
POST	/auth/signup	Register
POST	/auth/login	Login
POST	/api/v2/start-automation	Start bot
GET	/api/v2/automation-status/{id}	Poll status
GET	/api/v2/automation-results/{id}	Get results
POST	/api/v1/resume/upload	Upload resume
🧪 Troubleshooting
Issue	Solution
DB connection error	Verify DATABASE_URL
CORS error	Set CORS_ORIGINS correctly
AI not answering fields	Ensure AI key configured
Automation stuck	Run once with headless=false
Playwright not installed	Run playwright install chromium
📈 Why This Project Is Powerful

This project demonstrates:

Full-stack engineering

AI integration

Automation engineering

Browser control

JWT auth

Database design

Subprocess management

Production deployment

This is not a basic student project — it is a real-world AI automation system.

📜 License

MIT License