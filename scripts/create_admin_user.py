"""관리자(admin) 계정 생성 스크립트

사용법:
  python scripts/create_admin_user.py
  python scripts/create_admin_user.py [비밀번호]

기본 비밀번호: admin123 (최초 로그인 후 반드시 변경하세요)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db
from app.models.user import User
from app.services.auth.auth_service import AuthService

ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@localhost"
DEFAULT_PASSWORD = "admin123"


def create_admin_user(password: str = DEFAULT_PASSWORD) -> None:
    db = next(get_db())
    auth = AuthService()

    try:
        existing = db.query(User).filter(
            (User.username == ADMIN_USERNAME) | (User.email == ADMIN_EMAIL)
        ).first()

        if existing:
            # 이미 있으면 역할만 관리자로 변경
            existing.role = "admin"
            existing.is_superuser = True
            existing.is_active = True
            if password != DEFAULT_PASSWORD or not auth.verify_password(password, existing.hashed_password):
                existing.hashed_password = auth.get_password_hash(password)
            db.commit()
            db.refresh(existing)
            print(f"기존 계정을 관리자로 설정했습니다: {existing.username} (ID: {existing.id})")
            return

        hashed = auth.get_password_hash(password)
        user = User(
            email=ADMIN_EMAIL,
            username=ADMIN_USERNAME,
            hashed_password=hashed,
            full_name="관리자",
            role="admin",
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print("=" * 60)
        print("관리자 계정이 생성되었습니다.")
        print("=" * 60)
        print(f"  아이디(사용자명): {ADMIN_USERNAME}")
        print(f"  이메일:           {ADMIN_EMAIL}")
        print(f"  비밀번호:         {password}")
        print("=" * 60)
        print("최초 로그인 후 비밀번호 변경을 권장합니다.")
    except Exception as e:
        db.rollback()
        print(f"오류: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    password = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PASSWORD
    if password == DEFAULT_PASSWORD:
        print(f"비밀번호 미입력 시 기본값 사용: {DEFAULT_PASSWORD}")
    create_admin_user(password)
