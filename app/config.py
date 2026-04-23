"""애플리케이션 설정 관리"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """애플리케이션 설정"""
    
    # Database
    # PostgreSQL 연결 (환경 변수에서 우선 읽고, 없으면 기본값 사용)
    # 비밀번호에 특수문자가 있으므로 URL 인코딩 필요
    # IPv6 연결 문제 방지를 위해 127.0.0.1 사용
    # 포트: 5433 (PostgreSQL 18 기본 포트)
    DATABASE_URL: str = "postgresql://postgres:Atech123%21%40%23@127.0.0.1:5433/AI_HR"
    DATABASE_ECHO: bool = False
    
    @classmethod
    def get_database_url(cls) -> str:
        """데이터베이스 URL 가져오기 (특수문자 인코딩 처리)"""
        from urllib.parse import quote_plus
        password = "Atech123!@#"
        encoded_password = quote_plus(password)
        return f"postgresql://postgres:{encoded_password}@localhost:5432/AI_HR"
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4-turbo-preview"
    
    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    # 프론트엔드 기본 URL (공개 채용공고 링크 생성 시 사용)
    FRONTEND_URL: Optional[str] = None
    # CORS: 쉼표로 구분한 오리진 목록 (예: http://218.151.134.47:3000,http://localhost:3000).
    # 비우면 main.py가 localhost + IPv4 주소 Origin 패턴을 사용합니다 (JWT는 Authorization 헤더로 동작).
    CORS_ORIGINS: Optional[str] = None
    # Optional: 추가 Origin 정규식 (main.py에서 IPv4·호스트명 기본 패턴과 OR 병합).
    CORS_ORIGIN_REGEX: Optional[str] = None

    # Storage
    STORAGE_TYPE: str = "local"
    STORAGE_PATH: str = "./storage"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    
    # Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_FROM: Optional[str] = None
    SMTP_USE_TLS: bool = True
    SMTP_PASSWORD: Optional[str] = None
    
    # External APIs
    JOB_SITE_API_KEY: Optional[str] = None
    TAX_API_KEY: Optional[str] = None

    # Celery (스케줄/비동기 작업)
    # 값이 없으면 로컬 Redis 기본값을 사용해 API 서버 기동이 중단되지 않게 합니다.
    CELERY_BROKER_URL: str = "redis://127.0.0.1:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://127.0.0.1:6379/1"
    CELERY_TIMEZONE: str = "Asia/Seoul"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
