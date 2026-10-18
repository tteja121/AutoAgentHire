"""
Configuration management using Pydantic Settings.
Loads environment variables and provides type-safe configuration.
"""
import os
from pathlib import Path
from typing import List, Optional, Any, Set
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

# Resolve .env from backend directory and project root
_backend_env = Path(__file__).resolve().parent / ".env"
_root_env = Path(__file__).resolve().parent.parent / ".env"
_ENV_FILES = [str(p) for p in [_root_env, _backend_env] if p.exists()]

KNOWN_INSECURE_SECRETS: Set[str] = {
    "Zf9XeUbaW1GqoXvT9WZfOoMA2ZcjwpcmAybvkWLpBb8",
    "dev-secret-change-in-production",
    "change-this-in-production",
    "your-secret-key-here",
    "your-secret-key",
    "your-secret-key-here-change-this",
    "your-jwt-secret",
    "secret",
    "changeme",
    "12345678901234567890123456789012",
}


def validate_secret_key_value(secret_key: Optional[str]) -> str:
    """Validate that SECRET_KEY is set, at least 32 chars, and not a known placeholder.

    To generate a secure key, run:
        python -c "import secrets; print(secrets.token_urlsafe(32))"
    """
    if not secret_key or not isinstance(secret_key, str) or not secret_key.strip():
        raise RuntimeError(
            "SECRET_KEY environment variable is required and must not be empty. "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    key = secret_key.strip()
    if len(key) < 32:
        raise RuntimeError(
            f"SECRET_KEY must be at least 32 characters long (current length: {len(key)}). "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    lower_key = key.lower()
    if (
        key in KNOWN_INSECURE_SECRETS
        or any(p in lower_key for p in ["change-this", "change_this", "your-secret", "placeholder"])
        or lower_key in ("abcdefghijklmnopqrstuvwxyz123456", "12345678901234567890123456789012")
    ):
        raise RuntimeError(
            f"SECRET_KEY cannot be set to a known placeholder or default value. "
            "Generate a secure key with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    return key


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    APP_NAME: str = "AutoAgentHire"
    APP_ENV: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"
    SQL_ECHO: bool = False
    
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = Field(default=8000, validation_alias="PORT")  # Support both API_PORT and PORT (for Render)
    API_RELOAD: bool = True
    
    # Security
    SECRET_KEY: str = Field(description="Must be set via environment variable, at least 32 characters, non-placeholder")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MongoDB Atlas
    MONGODB_URI: str = Field(default="", description="Set MONGODB_URI in .env")
    MONGODB_DB_NAME: str = "autoagenthire"
    MONGODB_USERNAME: Optional[str] = None
    MONGODB_PASSWORD: Optional[str] = None

    @field_validator("SECRET_KEY", mode="before")
    @classmethod
    def validate_secret_key(cls, v: Any) -> str:
        return validate_secret_key_value(v)
    
    # Database
    DATABASE_URL: str = "sqlite:///./data/autoagenthire.db"  # SQLite fallback if not set
    SYNC_DATABASE_URL: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Vector Database
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8001
    CHROMA_PERSIST_DIRECTORY: str = "./vector_db/data"
    
    # Pinecone (alternative)
    PINECONE_API_KEY: Optional[str] = None
    PINECONE_ENVIRONMENT: Optional[str] = None
    PINECONE_INDEX_NAME: Optional[str] = None
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None   # Optional — app falls back to Gemini/Groq
    OPENAI_MODEL: str = "gpt-4-turbo-preview"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_MAX_TOKENS: int = 4000
    OPENAI_TEMPERATURE: float = 0.7
    
    # Anthropic (alternative)
    ANTHROPIC_API_KEY: Optional[str] = None
    
    # CrewAI
    CREWAI_TELEMETRY: bool = False
    
    # OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None
    
    LINKEDIN_OAUTH_CLIENT_ID: Optional[str] = None
    LINKEDIN_OAUTH_CLIENT_SECRET: Optional[str] = None
    LINKEDIN_OAUTH_REDIRECT_URI: Optional[str] = None
    
    # Web Automation
    SELENIUM_HEADLESS: bool = True
    SELENIUM_IMPLICIT_WAIT: int = 10
    PLAYWRIGHT_HEADLESS: bool = True
    PLAYWRIGHT_TIMEOUT: int = 30000
    
    # Proxy
    USE_PROXY: bool = False
    PROXY_URL: Optional[str] = None
    
    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_FROM_NAME: str = "AutoAgentHire Platform"
    SMTP_USE_TLS: bool = True
    SMTP_ENABLED: bool = True
    RESEND_API_KEY: Optional[str] = None
    SENDGRID_API_KEY: Optional[str] = None
    SENDGRID_FROM_EMAIL: Optional[str] = None
    NOTIFICATION_EMAIL: Optional[str] = None
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000
    
    # Job Search
    MAX_JOBS_PER_SEARCH: int = 100
    SEARCH_DELAY_SECONDS: int = 2
    MAX_APPLICATIONS_PER_DAY: int = 10
    
    # Feature Flags
    ENABLE_AUTO_APPLY: bool = False
    ENABLE_EMAIL_NOTIFICATIONS: bool = True
    ENABLE_DAILY_REPORTS: bool = True
    
    # Monitoring
    SENTRY_DSN: Optional[str] = None
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090
    
    # Encryption
    ENCRYPTION_KEY: Optional[str] = None
    
    # Frontend
    STREAMLIT_PORT: int = 8501
    REACT_APP_API_URL: str = "http://localhost:8000"

    # CORS - stored as comma-separated string in .env, parsed to list
    # Include localhost/127.0.0.1, Vite 5173, and production Vercel frontend
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://localhost:8080,http://127.0.0.1:8080,"
        "http://localhost:5173,http://localhost:8501,https://auto-agent-hire.vercel.app"
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS string to list."""
        if not hasattr(self, '_cors_origins_list_cache'):
            object.__setattr__(self, '_cors_origins_list_cache',
                [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()])
        return self._cors_origins_list_cache  # type: ignore

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_RESUME_EXTENSIONS: str = "pdf,docx,txt"
    
    @property
    def allowed_extensions_list(self) -> List[str]:
        """Parse ALLOWED_RESUME_EXTENSIONS string to list."""
        if not hasattr(self, '_allowed_extensions_list_cache'):
            object.__setattr__(self, '_allowed_extensions_list_cache',
                [e.strip() for e in self.ALLOWED_RESUME_EXTENSIONS.split(",") if e.strip()])
        return self._allowed_extensions_list_cache  # type: ignore

    # Optional fields present in .env but not strictly required
    LLAMA_MODEL_PATH: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GITHUB_API_KEY: Optional[str] = None
    QDRANT_URL: Optional[str] = None
    QDRANT_API_KEY: Optional[str] = None
    PLAYWRIGHT_BROWSERS_PATH: Optional[str] = None
    DISABLE_LOCAL_VECTOR_STORE: bool = False
    
    # Logging
    LOG_FILE_PATH: str = "data/logs/app.log"
    LOG_ROTATION: str = "10 MB"
    LOG_RETENTION: str = "30 days"
    
    class Config:
        env_file = _ENV_FILES
        env_file_encoding = "utf-8"
        case_sensitive = True
        # Ignore extra environment variables that are not declared on the model
        extra = "ignore"


# Global settings instance
try:
    settings = Settings()  # type: ignore[call-arg]
except Exception as e:
    # If environment parsing/validation fails, ensure SECRET_KEY is strictly checked
    _secret_key = validate_secret_key_value(os.environ.get("SECRET_KEY", ""))
    print("Warning: Settings validation failed, falling back to minimal defaults:", e)

    settings = Settings.model_construct(  # type: ignore[call-arg]
        APP_NAME=os.environ.get("APP_NAME", "AutoAgentHire"),
        APP_ENV=os.environ.get("APP_ENV", "development"),
        DEBUG=os.environ.get("DEBUG", "True") in ["True", "true", "1"],
        LOG_LEVEL=os.environ.get("LOG_LEVEL", "INFO"),
        API_HOST=os.environ.get("API_HOST", "0.0.0.0"),
        API_PORT=int(os.environ.get("PORT", os.environ.get("API_PORT", "8000"))),
        API_RELOAD=False,
        SECRET_KEY=_secret_key,
        DATABASE_URL=os.environ.get("DATABASE_URL", "sqlite:///./data/autoagenthire.db"),
        OPENAI_API_KEY=os.environ.get("OPENAI_API_KEY", ""),
        CORS_ORIGINS=os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://localhost:8501"),
        ALLOWED_RESUME_EXTENSIONS=os.environ.get("ALLOWED_RESUME_EXTENSIONS", "pdf,docx,txt"),
    )
