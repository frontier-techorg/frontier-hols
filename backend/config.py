"""Application configuration loaded from the backend .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Database ----
    database_url: str = ""

    # ---- AWS Credentials (shared by S3, SES, DynamoDB, Bedrock) ----
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # ---- S3 Storage ----
    s3_region: str = "eu-north-1"
    s3_bucket_name: str = ""

    # ---- Email (Amazon SES) ----
    ses_region: str = "ap-southeast-2"
    ses_from: str = ""

    # ---- Frontend (email CTAs, invite links) ----
    frontend_url: str = "http://localhost:3000"

    # ---- Bedrock (Clinic Onboarding Agent) ----
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = ""
    bedrock_api_key: str = ""

    # ---- DynamoDB ----
    dynamodb_region: str = "us-east-1"
    dynamodb_table: str = "hols-backend"

    # ---- Auth / JWT ----
    jwt_secret_key: str = "change-me"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # ---- Environment ----
    # development | production  (development bypasses the payment processor)
    app_env: str = "development"

    # ---- OTP ----
    # true (default): every student, admin, and affiliate login requires OTP
    # false: login never asks for OTP, regardless of APP_ENV
    enable_otp: bool = True
    otp_required_after_seconds: int = 604800
    otp_expire_seconds: int = 600

    # ---- Logging ----
    log_level: str = "INFO"
    log_format: str = "plain"

    # ---- AI Adviser / Chat ----
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Intake card: quality + speed. Follow-up: fastest interactive replies.
    chat_model: str = "openai/gpt-4o-mini"
    chat_model_followup: str = "openai/gpt-4o-mini"
    chroma_api_key: str = ""
    chroma_tenant: str = ""
    chroma_database: str = "ai_adviser"
    chroma_collection: str = "peptide_chunks"
    chroma_ssl_verify: str = "true"
    embed_model: str = "perplexity/pplx-embed-v1-4b"
    embed_batch_size: int = 32
    top_k: int = 3
    chat_memory_max_tokens: int = 4000
    chat_messages_page_size: int = 30
    chat_max_tokens_intake: int = 650
    chat_max_tokens_followup: int = 280
    chat_max_turns: int = 50

    def environment_name(self) -> str:
        value = (self.app_env or "development").strip().lower()
        if value in {"prod", "production"}:
            return "production"
        return "development"

    def is_development(self) -> bool:
        return self.environment_name() == "development"

    def is_production(self) -> bool:
        return self.environment_name() == "production"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance so the .env is parsed only once."""
    return Settings()


settings = get_settings()
