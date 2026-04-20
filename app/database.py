"""데이터베이스 연결 및 세션 관리"""
import sys
import os
from sqlalchemy import create_engine, URL, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import Pool
from app.config import settings
from app.models.base import Base

# Windows 환경 인코딩 설정
if sys.platform == 'win32':
    os.environ['PGCLIENTENCODING'] = 'UTF8'
    # Python 출력 인코딩 설정
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except:
            pass

# PostgreSQL 연결 정보 (특수문자 안전 처리)
def get_database_url():
    """데이터베이스 URL 생성 (SQLAlchemy URL 객체 사용)"""
    # SQLAlchemy URL 객체로 직접 생성 (특수문자 자동 처리)
    # IPv6 연결 문제 방지를 위해 127.0.0.1 사용
    try:
        return URL.create(
            drivername="postgresql",
            username="postgres",
            password="Atech123!@#",  # 특수문자 포함
            host="127.0.0.1",  # localhost 대신 IPv4 주소 사용 (IPv6 연결 문제 방지)
            port=5433,  # PostgreSQL 18 기본 포트
            database="AI_HR"
        )
    except Exception as e:
        # URL 객체 생성 실패 시 환경 변수나 설정에서 읽기
        print(f"URL 객체 생성 실패, 설정값 사용: {e}")
        # 설정값도 IPv4로 변경
        db_url = settings.DATABASE_URL.replace("localhost", "127.0.0.1")
        return db_url

# 연결 후 인코딩 설정 함수
@event.listens_for(Pool, "connect")
def set_encoding(dbapi_conn, connection_record):
    """연결 후 즉시 UTF-8 인코딩 설정"""
    try:
        # psycopg2 연결 객체에서 직접 인코딩 설정
        if hasattr(dbapi_conn, 'set_client_encoding'):
            try:
                dbapi_conn.set_client_encoding('UTF8')
            except Exception as e:
                # 인코딩 설정 실패 시 로그 (디버깅용)
                if settings.DEBUG:
                    print(f"Warning: set_client_encoding failed: {e}")
        # SQL로도 설정 (이중 보안)
        try:
            with dbapi_conn.cursor() as cursor:
                cursor.execute("SET client_encoding TO 'UTF8'")
                cursor.execute("SET timezone TO 'Asia/Seoul'")
        except Exception as e:
            if settings.DEBUG:
                print(f"Warning: SQL encoding setup failed: {e}")
    except Exception as e:
        # 모든 인코딩 설정 실패는 무시하고 계속 진행
        if settings.DEBUG:
            print(f"Warning: Encoding setup failed: {e}")

# 데이터베이스 엔진 생성 (연결 시도는 지연)
# 인코딩 문제 해결: connect_args에 인코딩 명시
database_url = get_database_url()

# psycopg2 연결 시 인코딩을 명시적으로 설정하는 커스텀 연결 함수
def create_connection_with_encoding():
    """인코딩이 명시적으로 설정된 연결 생성"""
    import psycopg2
    try:
        # URL 객체에서 연결 정보 추출
        if isinstance(database_url, URL):
            conn = psycopg2.connect(
                host=database_url.host or "127.0.0.1",  # IPv4 주소 사용
                port=database_url.port or 5433,  # PostgreSQL 18 기본 포트
                database=database_url.database or "AI_HR",
                user=database_url.username or "postgres",
                password=database_url.password or "",
                client_encoding='UTF8'
            )
            # 연결 후 즉시 인코딩 설정
            conn.set_client_encoding('UTF8')
            return conn
        else:
            # 문자열 URL인 경우
            return psycopg2.connect(
                str(database_url),
                client_encoding='UTF8'
            )
    except Exception as e:
        print(f"커스텀 연결 생성 실패: {e}")
        raise

# 데이터베이스 엔진 생성 (연결 풀 초기화)
try:
    # URL 객체를 문자열로 변환하여 명시적으로 인코딩 설정
    if isinstance(database_url, URL):
        # URL 객체를 렌더링하여 연결 문자열 생성
        database_url_str = str(database_url.render_as_string(hide_password=False))
    else:
        database_url_str = str(database_url)
    
    engine = create_engine(
        database_url_str,
        echo=settings.DATABASE_ECHO,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        connect_args={
            "client_encoding": "UTF8",
            "options": "-c client_encoding=UTF8"
        },
        # 연결 풀에서 인코딩 오류 방지
        pool_reset_on_return='commit',
        # 연결 풀 즉시 초기화 방지 (지연 연결)
        poolclass=None
    )
except Exception as e:
    print(f"데이터베이스 엔진 생성 오류: {e}")
    # 기본 설정으로 재시도
    engine = create_engine(
        settings.DATABASE_URL,
        echo=settings.DATABASE_ECHO,
        pool_pre_ping=True,
        connect_args={"client_encoding": "UTF8"}
    )

# 세션 팩토리 생성
# expire_on_commit=False: commit() 직후에도 같은 요청에서 ORM 인스턴스 속성 접근 시
# 만료/재조회로 인한 예외(로그인 직후 UserResponse 생성 등)를 방지
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, expire_on_commit=False
)


def get_db():
    """데이터베이스 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
