"""
Seed Job Postings for AutoAgentHire Recruiter Portal & Candidate Board.
Seeds 22+ diverse job postings across different departments, skills, and experience levels.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.database.connection import SessionLocal
from backend.database.models_complete import JobPosting, User


JOBS_DATA = [
    # ── 1. SOFTWARE & SYSTEM ENGINEERING ─────────────────────────────────────
    {
        "title": "Senior Frontend Engineer",
        "company_name": "Nexus AI Labs",
        "organization_symbol": "NXAI",
        "company_logo_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$135,000 - $175,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US / Canada)",
        "department": "Frontend Engineering",
        "description": "Lead frontend architecture for our high-throughput AI intelligence platform. You will build highly responsive, dynamic dashboards, interactive data streams, and micro-animations with React 19, TypeScript, and modern state management.",
        "requirements": "• 5+ years building modern client-side applications with React and TypeScript\n• Mastery of Tailwind CSS, Framer Motion, and design systems\n• Deep understanding of WebSockets, HTTP streaming, and client-side caching (TanStack Query / Zustand)\n• Passion for sleek UI aesthetics, 60fps performance, and accessibility.",
        "recruiting_process": "1. 30m Recruiter Screen\n2. 60m Technical Deep Dive (React/TypeScript Architecture)\n3. 45m UI Pairing Session\n4. Culture & Leadership Discussion\n5. Offer",
    },
    {
        "title": "Backend Systems Engineer (Distributed Systems)",
        "company_name": "QuantumCloud Systems",
        "organization_symbol": "QCS",
        "company_logo_url": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=128&h=128&fit=crop",
        "vacancies": 3,
        "salary_description": "$150,000 - $195,000 / year",
        "job_type": "Full-time",
        "location": "San Francisco, CA (Hybrid)",
        "department": "Backend Systems",
        "description": "Design and scale core distributed services processing millions of background automation tasks daily. You will optimize Go and Python microservices, handle concurrent queues, and optimize database transactions under high load.",
        "requirements": "• 4+ years backend development in Go (Golang) or high-performance Python (FastAPI/AsyncIO)\n• Strong experience with message brokers like Apache Kafka, RabbitMQ, or Redis Pub/Sub\n• Practical knowledge of PostgreSQL indexing, connection pooling, and ACID guarantees\n• Experience with gRPC, Docker, and distributed tracing (OpenTelemetry).",
        "recruiting_process": "1. Recruiter Chat\n2. Distributed Systems & Concurrency Problem Solving\n3. Database & Architecture Design\n4. Engineering Director Fit\n5. Offer",
    },
    {
        "title": "DevOps & Cloud Infrastructure Engineer",
        "company_name": "AutoHire Technologies",
        "organization_symbol": "AUTO",
        "company_logo_url": "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$140,000 - $180,000 / year",
        "job_type": "Full-time",
        "location": "Remote (Pacific / Eastern)",
        "department": "DevOps & Cloud",
        "description": "Own our cloud deployment footprint on AWS and GCP. Automate infrastructure as code, establish resilient Kubernetes clusters, and scale CI/CD pipelines for 10x developer velocity and 99.99% system reliability.",
        "requirements": "• 4+ years of DevOps/SRE experience with AWS or GCP\n• Production expertise with Kubernetes (EKS/GKE), Helm, and Terraform\n• CI/CD pipeline automation with GitHub Actions or GitLab CI\n• Experience with infrastructure observability: Prometheus, Grafana, Datadog\n• Strong shell scripting and security hardening best practices.",
        "recruiting_process": "1. Recruiter Phone Screen\n2. Cloud Infrastructure & Terraform Case Study\n3. Troubleshooting & Linux/K8s Scenario\n4. Offer & Compensation Discussion",
    },
    {
        "title": "Mobile App Developer (iOS & Android)",
        "company_name": "Pulse Mobility",
        "organization_symbol": "PULS",
        "company_logo_url": "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$125,000 - $160,000 / year",
        "job_type": "Full-time",
        "location": "Austin, TX (Remote Optional)",
        "department": "Mobile Engineering",
        "description": "Architect and release intuitive cross-platform mobile apps for candidates and recruiters. You will build smooth offline-first experiences, push notifications, and background biometric authentication.",
        "requirements": "• 3+ years cross-platform mobile development with React Native or Flutter\n• Native bridge experience (Swift/Kotlin) for platform-specific capabilities\n• Experience publishing apps to Apple App Store and Google Play Store\n• Deep understanding of mobile performance, memory optimization, and offline sync.",
        "recruiting_process": "1. Initial Screening\n2. Mobile Code Review & Portfolio Walkthrough\n3. Architectural Interview\n4. Team Fit\n5. Offer",
    },
    {
        "title": "QA Automation & Test Systems Engineer",
        "company_name": "Vanguard Robotics",
        "organization_symbol": "VROB",
        "company_logo_url": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$110,000 - $145,000 / year",
        "job_type": "Full-time",
        "location": "Remote (Global)",
        "department": "Quality Assurance",
        "description": "Establish reliable automated end-to-end testing suites across web applications and backend microservices. You will prevent regressions and build human-like browser testing with Playwright and PyTest.",
        "requirements": "• 3+ years writing automated test suites using Playwright, Cypress, or Selenium\n• Strong Python or TypeScript scripting skills\n• Experience integrating E2E suites into CI/CD build gates\n• Solid understanding of load testing (k6, Locust) and API contract testing.",
        "recruiting_process": "1. HR Phone Screen\n2. Hands-on Automation Coding Challenge\n3. Test Strategy & Architecture Discussion\n4. Final Offer",
    },

    # ── 2. ARTIFICIAL INTELLIGENCE & MACHINE LEARNING ────────────────────────
    {
        "title": "Lead AI / LLM Systems Engineer",
        "company_name": "Nexus AI Labs",
        "organization_symbol": "NXAI",
        "company_logo_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$180,000 - $240,000 / year",
        "job_type": "Full-time",
        "location": "San Francisco, CA / Remote",
        "department": "Artificial Intelligence",
        "description": "Architect multi-agent workflows, vector retrieval pipelines, and fine-tuning pipelines for autonomous hiring agents. You will push the boundaries of RAG, structured tool calling, and latency reduction for frontier model inferences.",
        "requirements": "• 4+ years in machine learning with 2+ years dedicated to LLMs, RAG, and agentic reasoning\n• Production proficiency with LangChain, LlamaIndex, or AutoGen\n• Deep knowledge of vector search (Qdrant, FAISS, Pinecone) and hybrid dense/sparse retrieval\n• Experience with model fine-tuning, LoRA, and vLLM inference serving.",
        "recruiting_process": "1. 30m Technical Recruiter Chat\n2. 60m System Design: Scalable Multi-Agent LLM Architecture\n3. 60m Live Python/PyTorch Modeling Session\n4. Founders Interview\n5. Offer",
    },
    {
        "title": "Machine Learning Research Scientist (Computer Vision & NLP)",
        "company_name": "HyperScale Data",
        "organization_symbol": "HPDT",
        "company_logo_url": "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$175,000 - $225,000 / year",
        "job_type": "Full-time",
        "location": "Seattle, WA (Hybrid)",
        "department": "Artificial Intelligence",
        "description": "Conduct applied research on document parsing, multimodal visual understanding, and semantic matching models. You will take research prototypes from papers to low-latency GPU production endpoints.",
        "requirements": "• MS or PhD in Computer Science, Machine Learning, or related quantitative field\n• Track record with PyTorch, Hugging Face Transformers, and multimodal models\n• Experience training and evaluating vision-language models (VLMs) and embedding spaces\n• Knowledge of model pruning, quantization (AWQ, GPTQ), and TensorRT-LLM.",
        "recruiting_process": "1. Phone Screen\n2. Research Presentation & Past Paper Discussion\n3. Algorithmic Coding Interview\n4. Engineering Team Alignment\n5. Offer",
    },

    # ── 3. DATA ENGINEERING & ANALYTICS ──────────────────────────────────────
    {
        "title": "Senior Data Engineer (Lakehouse & Pipelines)",
        "company_name": "Apex FinScale",
        "organization_symbol": "AFIN",
        "company_logo_url": "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$145,000 - $185,000 / year",
        "job_type": "Full-time",
        "location": "New York, NY (Remote)",
        "department": "Data & Analytics",
        "description": "Build high-integrity analytical data pipelines powering financial metrics and real-time recruitment telemetry. You will architect dbt transformation models, Apache Iceberg tables, and real-time Kafka consumers.",
        "requirements": "• 5+ years of data engineering experience with SQL, Python, and modern data warehouses (Snowflake, BigQuery)\n• Production experience with dbt (data build tool) and workflow orchestrators (Airflow, Dagster)\n• Expertise in data modeling, schema evolution, and data quality testing (Great Expectations)\n• Experience handling high volume streaming data via Kafka or Kinesis.",
        "recruiting_process": "1. Recruiter Screen\n2. SQL & Data Modeling Assessment\n3. Architecture & Pipeline Design\n4. VP of Engineering Interview\n5. Offer",
    },
    {
        "title": "Lead Business Intelligence & Analytics Analyst",
        "company_name": "Starlight HealthTech",
        "organization_symbol": "SLHT",
        "company_logo_url": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$115,000 - $150,000 / year",
        "job_type": "Full-time",
        "location": "Boston, MA (Hybrid)",
        "department": "Data & Analytics",
        "description": "Transform multi-source user engagement data into actionable executive insights. You will deliver automated BI reporting suites, cohort retention analyses, and forecast revenue funnels.",
        "requirements": "• 4+ years of experience delivering enterprise analytics in Tableau, PowerBI, or Looker\n• Advanced SQL skills (complex CTEs, window functions, query performance tuning)\n• Statistical analysis capabilities in Python (pandas, scipy) or R\n• Strong communication skills translating numbers into high-impact product recommendations.",
        "recruiting_process": "1. Recruiter Screen\n2. Analytical Case Study Presentation\n3. Executive Stakeholder Simulation\n4. Offer",
    },

    # ── 4. PRODUCT MANAGEMENT & UX DESIGN ────────────────────────────────────
    {
        "title": "Principal Product Manager (AI & Automation)",
        "company_name": "AutoHire Technologies",
        "organization_symbol": "AUTO",
        "company_logo_url": "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$165,000 - $210,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US)",
        "department": "Product Management",
        "description": "Define the future of automated hiring and talent discovery. You will guide technical roadmaps for candidate matching, AI interviewing, and recruiter collaboration tools.",
        "requirements": "• 6+ years product management experience, preferably in B2B SaaS or AI-driven platforms\n• Demonstrated track record shipping complex zero-to-one product initiatives\n• Strong technical acumen: ability to engage deeply with AI/ML and engineering teams\n• Rigorous focus on customer empathy, quantitative metrics, and user retention.",
        "recruiting_process": "1. Recruiter Screen\n2. Product Sense & Strategy Walkthrough\n3. Technical Collaboration Interview\n4. Executive Leadership Interview\n5. Offer",
    },
    {
        "title": "Lead Product & UI/UX Designer",
        "company_name": "Starlight HealthTech",
        "organization_symbol": "SLHT",
        "company_logo_url": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$130,000 - $165,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US / Europe)",
        "department": "Design",
        "description": "Craft stunning, intuitive, and accessible user journeys across desktop and mobile. You will scale our design system tokens, run user interviews, and deliver pixel-perfect prototypes in Figma.",
        "requirements": "• 5+ years designing responsive web applications with Figma\n• Portfolio demonstrating thoughtful user flows, typography, micro-interactions, and design systems\n• Experience conducting user research, usability testing, and translating findings into wireframes\n• Familiarity with modern frontend CSS frameworks and design-to-code handoffs.",
        "recruiting_process": "1. Portfolio Review with Recruiter\n2. Design Challenge & Past Work Presentation\n3. Cross-Functional Collaboration Interview\n4. Offer",
    },

    # ── 5. CYBERSECURITY & COMPLIANCE ────────────────────────────────────────
    {
        "title": "Information Security & Compliance Lead (SOC2 & Cloud)",
        "company_name": "CyberShield Security",
        "organization_symbol": "CSHD",
        "company_logo_url": "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$155,000 - $190,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US)",
        "department": "Security & Compliance",
        "description": "Guard candidate data confidentiality and lead company-wide security operations. You will oversee vulnerability management, pen testing, SOC 2 Type II audits, and zero-trust cloud network architecture.",
        "requirements": "• 5+ years experience in cybersecurity, security engineering, or cloud compliance\n• Hands-on experience achieving and maintaining SOC 2 Type II, GDPR, and ISO 27001 certifications\n• Expertise in cloud security posture management (AWS GuardDuty, CloudTrail, IAM policies)\n• Familiarity with application security (OWASP Top 10, SAST/DAST tooling).",
        "recruiting_process": "1. Screening Call\n2. Security Architecture & Threat Modeling Exercise\n3. Compliance Audit Strategy Session\n4. Executive Interview\n5. Offer",
    },

    # ── 6. MARKETING & GROWTH ────────────────────────────────────────────────
    {
        "title": "Director of Growth & Performance Marketing",
        "company_name": "Apex FinScale",
        "organization_symbol": "AFIN",
        "company_logo_url": "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$140,000 - $180,000 / year",
        "job_type": "Full-time",
        "location": "New York, NY (Hybrid)",
        "department": "Growth & Marketing",
        "description": "Drive exponential acquisition of enterprise recruiters and candidates through performance channels, SEO loops, viral referral mechanisms, and conversion funnel optimization.",
        "requirements": "• 5+ years leading digital acquisition and growth marketing for high-growth SaaS platforms\n• Deep expertise in paid acquisition (LinkedIn Ads, Google Ads, Meta) and CAC/LTV management\n• Analytical mindset with mastery of Google Analytics 4, Mixpanel, and marketing attribution tools\n• Experience managing creative campaigns and optimizing landing page conversions.",
        "recruiting_process": "1. Recruiter Screen\n2. Growth Strategy Case Study\n3. Funnel Optimization & Metrics Review\n4. Offer",
    },
    {
        "title": "Developer Advocate & Technical Content Strategist",
        "company_name": "QuantumCloud Systems",
        "organization_symbol": "QCS",
        "company_logo_url": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$115,000 - $145,000 / year",
        "job_type": "Full-time",
        "location": "Remote (Worldwide)",
        "department": "Developer Relations",
        "description": "Empower engineers and technical recruiters with authoritative guides, API documentation, demo applications, and engaging video tutorials. You will speak at conferences and foster our open developer ecosystem.",
        "requirements": "• Background in software development (Python, TypeScript, or Go) with a gift for clear technical writing\n• Proven experience publishing developer docs, technical blogs, or open source repos\n• Comfort delivering workshops, webinars, or conference talks\n• Active presence in open source or tech developer communities.",
        "recruiting_process": "1. Introductory Call\n2. Technical Writing & Sample Project Evaluation\n3. Community Presentation Simulation\n4. Final Offer",
    },

    # ── 7. SALES & SOLUTIONS ARCHITECTURE ────────────────────────────────────
    {
        "title": "Enterprise Solutions Architect (Pre-Sales & Integrations)",
        "company_name": "AutoHire Technologies",
        "organization_symbol": "AUTO",
        "company_logo_url": "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$160,000 - $205,000 / year",
        "job_type": "Full-time",
        "location": "Chicago, IL / Remote",
        "department": "Solutions Architecture",
        "description": "Partner with Fortune 500 talent acquisition leaders to design tailored enterprise integrations between their existing ATS systems (Workday, Greenhouse, Lever) and AutoAgentHire's AI automation engine.",
        "requirements": "• 5+ years in solutions engineering, enterprise architecture, or technical sales consulting\n• Strong grasp of RESTful APIs, Webhooks, OAuth2, and enterprise SSO (SAML/SCIM)\n• Ability to communicate complex technical concepts effectively to both CIOs and HR directors\n• High customer empathy and problem-solving mentality.",
        "recruiting_process": "1. Initial Call\n2. Mock Enterprise Client Discovery & Technical Whiteboard\n3. Leadership Interview\n4. Offer",
    },
    {
        "title": "Enterprise Account Executive (Strategic B2B)",
        "company_name": "Nexus AI Labs",
        "organization_symbol": "NXAI",
        "company_logo_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$120,000 base / $240,000 OTE",
        "job_type": "Full-time",
        "location": "San Francisco, CA / New York, NY",
        "department": "Enterprise Sales",
        "description": "Drive high-ticket enterprise contracts with tech startups and established enterprises seeking to accelerate hiring velocity with autonomous AI agents. You will own full sales cycle from discovery to close.",
        "requirements": "• 4+ years of B2B SaaS closing experience with average deal sizes >$50k ACV\n• Consistent track record of quota attainment (>100% of annual plan)\n• Proficiency in consultative selling methodologies (MEDDPICC, Command of the Message)\n• Strong CRM discipline in Salesforce or HubSpot.",
        "recruiting_process": "1. Recruiter Phone Screen\n2. Sales Roleplay & Discovery Demo\n3. VP of Sales Interview\n4. Offer & Commission Plan",
    },

    # ── 8. CUSTOMER SUCCESS & SUPPORT ────────────────────────────────────────
    {
        "title": "Lead Customer Success Manager (Strategic Accounts)",
        "company_name": "Vanguard Robotics",
        "organization_symbol": "VROB",
        "company_logo_url": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$105,000 - $135,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US)",
        "department": "Customer Success",
        "description": "Ensure recruiters and hiring teams maximize candidate placement velocity and ROI using our platform. You will lead onboarding bootcamps, quarterly business reviews (QBRs), and drive account renewals.",
        "requirements": "• 4+ years in customer success or account management in high-growth B2B software\n• Track record driving net revenue retention (NRR > 115%) and reducing churn\n• Exceptional interpersonal communication, project management, and relationship-building skills\n• Experience with Gainsight, ChurnZero, or Zendesk.",
        "recruiting_process": "1. Recruiter Screen\n2. Customer Scenario & Onboarding Roleplay\n3. Leadership Interview\n4. Offer",
    },
    {
        "title": "Technical Support & Implementation Specialist",
        "company_name": "Pulse Mobility",
        "organization_symbol": "PULS",
        "company_logo_url": "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$85,000 - $110,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US / Europe / LatAm)",
        "department": "Customer Operations",
        "description": "Triage technical customer queries, debug API webhook payloads, and help enterprise administrators configure custom candidate pipelines. You will be the bridge between our customers and engineering team.",
        "requirements": "• 2+ years in technical support, application support, or Tier 2/3 customer service\n• Familiarity with browser developer tools, HTTP status codes, SQL queries, and Postman\n• Patient, empathetic communicator with excellent written English skills\n• Excitement for troubleshooting complex integration edge cases.",
        "recruiting_process": "1. Phone Screen\n2. Troubleshooting Simulation Test\n3. Team Fit Call\n4. Offer",
    },

    # ── 9. HUMAN RESOURCES & TALENT ACQUISITION ──────────────────────────────
    {
        "title": "Senior Technical Recruiter (Engineering & AI)",
        "company_name": "AutoHire Technologies",
        "organization_symbol": "AUTO",
        "company_logo_url": "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
        "vacancies": 2,
        "salary_description": "$110,000 - $145,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US / Canada)",
        "department": "Human Resources & Talent",
        "description": "Drive full-lifecycle hiring for world-class AI researchers, distributed systems engineers, and product leaders. You will utilize AutoAgentHire's proprietary tools to test, benchmark, and source top tier talent.",
        "requirements": "• 4+ years of full-cycle technical recruiting in high-growth tech startups or agencies\n• Deep understanding of tech stacks (Python, Go, React, LLMs, Cloud infrastructure)\n• Proven ability to attract and close passive candidates in competitive talent markets\n• Commitment to diversity, equity, and exceptional candidate experience.",
        "recruiting_process": "1. Recruiter Screen\n2. Sourcing & Screening Case Exercise\n3. Hiring Manager Alignment\n4. Offer",
    },
    {
        "title": "People Operations & HR Business Partner",
        "company_name": "HyperScale Data",
        "organization_symbol": "HPDT",
        "company_logo_url": "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$100,000 - $130,000 / year",
        "job_type": "Full-time",
        "location": "Seattle, WA / Remote",
        "department": "Human Resources & Talent",
        "description": "Foster an inspiring, high-performance remote workplace culture. You will oversee employee onboarding, compensation benchmarking, performance management cycles, and team wellbeing programs.",
        "requirements": "• 3+ years in People Operations, HR Generalist, or HRBP roles in distributed tech companies\n• Experience with modern HRIS platforms (Rippling, Gusto, BambooHR) and global payroll\n• High emotional intelligence, discretion, and problem-solving skills\n• Solid understanding of labor compliance and remote workforce policies.",
        "recruiting_process": "1. Phone Screen\n2. People Ops Scenario Walkthrough\n3. Leadership Interview\n4. Offer",
    },

    # ── 10. FINANCE, OPERATIONS & STRATEGY ───────────────────────────────────
    {
        "title": "Business Operations & Strategy Manager",
        "company_name": "Apex FinScale",
        "organization_symbol": "AFIN",
        "company_logo_url": "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$135,000 - $170,000 / year",
        "job_type": "Full-time",
        "location": "New York, NY / Remote",
        "department": "Finance & Strategy",
        "description": "Lead strategic initiatives across pricing model evolution, international market entry, and cross-functional operational efficiency. You will report directly to executive leadership.",
        "requirements": "• 3+ years in management consulting (MBB), investment banking, or BizOps at high-growth SaaS\n• Expert financial modeling skills in Excel and automated business dashboards in SQL\n• Structured analytical mindset capable of breaking down ambiguous strategic challenges\n• High autonomy and executive presence.",
        "recruiting_process": "1. Recruiter Screen\n2. BizOps Strategic Business Case Study\n3. Executive Leadership Interview\n4. Offer",
    },
    {
        "title": "Senior Financial Analyst (FP&A & SaaS Metrics)",
        "company_name": "AutoHire Technologies",
        "organization_symbol": "AUTO",
        "company_logo_url": "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
        "vacancies": 1,
        "salary_description": "$115,000 - $145,000 / year",
        "job_type": "Full-time",
        "location": "Remote (US)",
        "department": "Finance & Strategy",
        "description": "Own our corporate financial forecasts, SaaS unit economics (CAC, LTV, Magic Number), and department budget variances. Partner with department leads to ensure capital-efficient growth.",
        "requirements": "• 3+ years experience in corporate FP&A, strategic finance, or accounting\n• Deep understanding of SaaS revenue recognition, ARR/MRR dynamics, and cohort modeling\n• Advanced financial modeling skills and familiarity with planning tools (Planful, Cube, Pigment)\n• Strong presentation skills for board deck preparation.",
        "recruiting_process": "1. Recruiter Screen\n2. Financial Modeling Assessment\n3. Head of Finance Interview\n4. Offer",
    },
]


def seed_jobs():
    """Seed the job postings if they don't already exist."""
    print("=" * 60)
    print("[SEED] Seeding Job Postings into Recruiter Portal & Candidate Board...")
    print("=" * 60)

    db = SessionLocal()
    try:
        # Find recruiter account (default to Re@auto.in or first available recruiter)
        recruiter = db.query(User).filter(User.email.ilike("re@auto.in")).first()
        if not recruiter:
            recruiter = db.query(User).filter(User.role == "recruiter").first()
        if not recruiter:
            recruiter = db.query(User).first()

        if not recruiter:
            print("[ERROR] No recruiter or user found in the database. Please initialize users first.")
            return 0

        # Find authorizer account
        authorizer = db.query(User).filter(User.email.ilike("author@gmail.com")).first()
        if not authorizer:
            authorizer = db.query(User).filter(User.role == "authorizer").first()

        authorizer_id = authorizer.id if authorizer else None

        added_count = 0
        now = datetime.now(timezone.utc)

        for job_info in JOBS_DATA:
            # Check if job with same title and company already exists
            existing = db.query(JobPosting).filter(
                JobPosting.title == job_info["title"],
                JobPosting.company_name == job_info["company_name"]
            ).first()

            if existing:
                # Ensure status is approved so it is active
                if existing.status != "approved":
                    setattr(existing, "status", "approved")
                    setattr(existing, "authorizer_id", authorizer_id)
                    setattr(existing, "authorizer_notes", "Approved by System Authorizer")
                    setattr(existing, "authorized_at", now)
                    db.commit()
                continue

            new_job = JobPosting(
                recruiter_id=recruiter.id,
                company_name=job_info["company_name"],
                company_logo_url=job_info["company_logo_url"],
                organization_symbol=job_info["organization_symbol"],
                title=job_info["title"],
                vacancies=job_info["vacancies"],
                salary_description=job_info["salary_description"],
                job_type=job_info["job_type"],
                location=job_info["location"],
                description=job_info["description"],
                requirements=job_info["requirements"],
                recruiting_process=job_info["recruiting_process"],
                start_date_pt="2026-10-15 09:00:00 PDT",
                final_date_pt="2026-12-31 17:00:00 PDT",
                timezone="America/Los_Angeles (PT)",
                status="approved",  # Approved so it is visible immediately in candidate board and recruiter portal
                authorizer_id=authorizer_id,
                authorizer_notes="Approved and authorized for public portal",
                authorized_at=now,
            )
            db.add(new_job)
            added_count += 1

        db.commit()
        total_jobs = db.query(JobPosting).count()
        print(f"[SUCCESS] Successfully seeded {added_count} new job postings!")
        print(f"[STATUS] Total jobs in database: {total_jobs}")
        print("=" * 60)
        return added_count
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error seeding jobs: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_jobs()
