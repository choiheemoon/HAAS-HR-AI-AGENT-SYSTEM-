"""사용자 비밀번호 리셋 스크립트"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db
from app.models.user import User
from app.services.auth.auth_service import AuthService

def reset_password(email: str, new_password: str):
    """사용자 비밀번호 리셋"""
    db = next(get_db())
    
    try:
        # 사용자 찾기
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            print(f"오류: 이메일 '{email}'로 등록된 사용자를 찾을 수 없습니다.")
            return False
        
        print("=" * 80)
        print(f"사용자 정보:")
        print(f"  ID: {user.id}")
        print(f"  사용자명: {user.username}")
        print(f"  이메일: {user.email}")
        print("=" * 80)
        
        # 비밀번호 업데이트
        new_hashed_password = AuthService.get_password_hash(new_password)
        user.hashed_password = new_hashed_password
        
        db.commit()
        db.refresh(user)
        print(f"\n✓ 비밀번호가 성공적으로 변경되었습니다!")
        print(f"  새 비밀번호: {new_password}")
        print("\n이제 이 비밀번호로 로그인할 수 있습니다.")
        return True
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    
    email = "neo2838@naver.com"
    new_password = "test123456"  # 기본 비밀번호
    
    if len(sys.argv) > 1:
        new_password = sys.argv[1]
    
    print(f"비밀번호 리셋 중...")
    print(f"이메일: {email}")
    print(f"새 비밀번호: {new_password}\n")
    
    reset_password(email, new_password)
