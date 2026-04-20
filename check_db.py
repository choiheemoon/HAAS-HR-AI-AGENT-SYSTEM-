"""데이터베이스 확인 스크립트"""
import sqlite3
import os

db_path = "hr_ai_agent.db"
full_path = os.path.abspath(db_path)

print(f"데이터베이스 파일 경로: {full_path}")
print(f"파일 존재 여부: {os.path.exists(db_path)}")

if os.path.exists(db_path):
    file_size = os.path.getsize(db_path)
    print(f"파일 크기: {file_size:,} bytes")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 테이블 목록 조회
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = cursor.fetchall()
    
    print(f"\n생성된 테이블 목록 ({len(tables)}개):")
    for table in tables:
        table_name = table[0]
        # 각 테이블의 레코드 수 확인
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"  - {table_name}: {count}개 레코드")
        except:
            print(f"  - {table_name}: (조회 불가)")
    
    # users 테이블이 있으면 상세 정보 확인
    if any(t[0] == 'users' for t in tables):
        print("\n=== users 테이블 정보 ===")
        cursor.execute("PRAGMA table_info(users)")
        columns = cursor.fetchall()
        print("컬럼:")
        for col in columns:
            print(f"  - {col[1]} ({col[2]})")
        
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        print(f"\n총 사용자 수: {user_count}명")
        
        if user_count > 0:
            cursor.execute("SELECT id, email, username, full_name, role FROM users LIMIT 5")
            users = cursor.fetchall()
            print("\n사용자 목록:")
            for user in users:
                print(f"  - ID: {user[0]}, 이메일: {user[1]}, 사용자명: {user[2]}, 이름: {user[3]}, 역할: {user[4]}")
    
    conn.close()
else:
    print("\n데이터베이스 파일이 아직 생성되지 않았습니다.")
    print("백엔드 서버를 실행하면 자동으로 생성됩니다.")
