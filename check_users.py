"""데이터베이스에 등록된 사용자 확인 스크립트"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db
from app.models.user import User

def check_users():
    """등록된 사용자 목록 조회"""
    db = next(get_db())
    
    try:
        users = db.query(User).all()
        
        print("=" * 80)
        print("데이터베이스에 등록된 사용자 목록")
        print("=" * 80)
        
        if not users:
            print("등록된 사용자가 없습니다.")
        else:
            print(f"총 {len(users)}명의 사용자가 등록되어 있습니다.\n")
            
            for idx, user in enumerate(users, 1):
                print(f"[{idx}] 사용자 정보:")
                print(f"  ID: {user.id}")
                print(f"  사용자명: {user.username}")
                print(f"  이메일: {user.email}")
                # User 모델에 name 필드가 있는지 확인
                if hasattr(user, 'name'):
                    print(f"  이름: {user.name or '(없음)'}")
                print(f"  역할(role): {getattr(user, 'role', 'user')}")
                print(f"  슈퍼유저: {getattr(user, 'is_superuser', False)}")
                print(f"  활성화 여부: {getattr(user, 'is_active', True)}")
                print(f"  생성일: {user.created_at}")
                print(f"  수정일: {user.updated_at}")
                print("-" * 80)
        
        print("\n" + "=" * 80)
        print("로그인 가능한 사용자 (사용자명/이메일):")
        print("=" * 80)
        for user in users:
            if user.is_active:
                print(f"  - 사용자명: '{user.username}' 또는 이메일: '{user.email}'")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_users()
