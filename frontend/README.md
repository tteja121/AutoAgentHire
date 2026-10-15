# AutoAgentHire — Frontend

React + Vite + TypeScript web interface for AutoAgentHire.

## Tech Stack
- **Framework:** React 18 + Vite + TypeScript
- **Styling:** Tailwind CSS + Radix UI (shadcn/ui components)
- **Icons:** Lucide React
- **Animations:** Framer Motion
- **HTTP Client:** Axios (configured with base URL and JWT auth headers)
- **Routing:** React Router v6

## Directory Structure
```text
frontend/
├── src/
│   ├── components/     # UI components & dialogs
│   ├── pages/          # Application views (Dashboard, ATSChecker, LinkedInAutomation, etc.)
│   ├── services/       # API services (jobService, resumeService, applicationService)
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Axios API client & utility functions
│   ├── App.tsx         # Main router and providers
│   ├── main.tsx        # React root entrypoint
│   └── index.css       # Tailwind CSS styles and theme definitions
├── public/             # Static public assets
├── package.json        # Dependencies and npm scripts
├── vite.config.ts      # Vite configuration & path aliases (@/ -> ./src)
├── tailwind.config.ts  # Tailwind CSS configuration
└── tsconfig.json       # TypeScript configuration
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```
Ensure `VITE_API_URL` points to your backend:
```env
VITE_API_URL=http://localhost:8000
```

### 3. Run Development Server
```bash
npm run dev
```
The frontend dev server will start at `http://127.0.0.1:8080`.

### 4. Build for Production
```bash
npm run build
```
Production assets will be output to `frontend/dist/`.
