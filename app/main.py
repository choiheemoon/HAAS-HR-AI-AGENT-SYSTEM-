"""FastAPI 메인 애플리케이션"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import api_router
from app.api.v1.hr_report_compat import router as hr_report_compat_router
from app.config import settings
from app.database import engine
from app.models.base import Base

# 모든 모델 import (테이블 생성용)
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    """요청 수락 전에 DB 스키마 보정·테이블 생성(로그인 500 레이스 방지)"""
    try:
        from app.db_schema_ensure import ensure_postgresql_auth_schema

        ensure_postgresql_auth_schema(engine)
    except Exception as e:
        print(f"⚠️ 스키마 자동 보정 중 예외 (DB 연결·권한 확인): {str(e)[:200]}")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ 데이터베이스 테이블 생성 완료")
        try:
            from app.db_schema_ensure import ensure_attendance_performance_indexes

            ensure_attendance_performance_indexes(engine)
        except Exception as e_idx:
            print(f"⚠️ 근태 조회 성능 인덱스 보강: {str(e_idx)[:200]}")
    except Exception as e:
        error_msg = str(e)
        if "codec" in error_msg.lower() or "decode" in error_msg.lower():
            print(f"⚠️ 데이터베이스 인코딩 오류: {error_msg[:100]}")
            print("💡 해결 방법: PostgreSQL 데이터베이스의 Collation을 UTF8로 변경하세요.")
        else:
            print(f"⚠️ 데이터베이스 연결 오류: {error_msg[:100]}")
        print("서버는 시작되지만 데이터베이스 기능이 제한될 수 있습니다.")
    yield


app = FastAPI(
    title="HR AI Agent System",
    description="종합 인사관리 및 급여관리 AI 에이전트 시스템",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: allow_credentials=True 와 allow_origins=["*"] 는 브라우저에서 동시에 불가 →
# 프론트(3000)→API(8000) 직접 호출 시 CORS 헤더가 누락된 것처럼 보일 수 있음.
_DEFAULT_BROWSER_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
# e.g. frontend http://218.x.x.x:3000 and API http://218.x.x.x:8080
_CORS_IPV4_LITERAL_REGEX = r"^https?://(\d{1,3}\.){3}\d{1,3}(:\d+)?$"


def _cors_middleware_args():
    raw = (settings.CORS_ORIGINS or "").strip()
    if not raw:
        raw = _DEFAULT_BROWSER_ORIGINS
    origins = [o.rstrip("/") for o in raw.split(",") if o.strip()]
    fe = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if fe and fe not in origins:
        origins.append(fe)
    regex = (settings.CORS_ORIGIN_REGEX or "").strip() or _CORS_IPV4_LITERAL_REGEX
    if origins or regex:
        out: dict = {"allow_origins": origins, "allow_credentials": True}
        if regex:
            out["allow_origin_regex"] = regex
        return out
    return {"allow_origins": ["*"], "allow_credentials": False}


app.add_middleware(
    CORSMiddleware,
    **_cors_middleware_args(),
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(api_router, prefix="/api/v1")
# 인사레포트 단축 URL — main에 명시(배포 시 api 패키지 __init__ 누락에도 동작하도록)
app.include_router(hr_report_compat_router, prefix="/api/v1")


@app.get("/")
def root():
    """루트 엔드포인트"""
    return {
        "message": "HR AI Agent System API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    """헬스 체크"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
