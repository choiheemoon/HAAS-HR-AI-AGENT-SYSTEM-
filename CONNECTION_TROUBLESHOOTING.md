# PostgreSQL 연결 문제 해결

## 현재 오류

```
connection to server at "localhost" (::1), port 5432 failed: Connection
```

이 오류는 PostgreSQL 서버에 연결할 수 없다는 의미입니다.

## 해결 방법

### 1단계: PostgreSQL 서버 실행 확인

**방법 A: 서비스 관리자 사용**
1. `Win + R` 키 누르기
2. `services.msc` 입력 후 Enter
3. PostgreSQL 서비스 찾기 (예: `postgresql-x64-XX`)
4. 상태가 "실행 중"인지 확인
5. 실행 중이 아니면 우클릭 → 시작

**방법 B: PowerShell 사용**
```powershell
Get-Service | Where-Object {$_.Name -like "*postgresql*"}
```

서비스가 중지되어 있으면:
```powershell
Start-Service postgresql*
```

**방법 C: 배치 파일 사용**
- `check_postgresql.bat` 파일 실행

### 2단계: 포트 확인

PostgreSQL이 포트 5432에서 실행 중인지 확인:
```powershell
netstat -an | findstr ":5432"
```

결과가 없으면 PostgreSQL 서버가 실행되지 않은 것입니다.

### 3단계: 연결 설정 수정 (완료됨)

IPv6 연결 문제를 방지하기 위해 `localhost` 대신 `127.0.0.1`을 사용하도록 수정했습니다:

- `app/config.py`: `localhost` → `127.0.0.1`
- `app/database.py`: `localhost` → `127.0.0.1`

### 4단계: 서버 재시작

PostgreSQL 서버를 시작한 후:

```powershell
# 방법 1: 배치 파일 사용
start_server_utf8.bat

# 방법 2: PowerShell에서 직접 실행
$env:PGCLIENTENCODING='UTF8'
$env:PYTHONIOENCODING='utf-8'
cd "D:\1.Atechsolution repository\88.HR AI AGENT"
python run.py
```

## 확인 사항 체크리스트

- [ ] PostgreSQL 서비스가 실행 중인가?
- [ ] 포트 5432가 열려있는가?
- [ ] 방화벽이 포트를 차단하지 않는가?
- [ ] PostgreSQL 설치가 올바른가?

## 추가 문제 해결

### PostgreSQL이 설치되지 않은 경우

PostgreSQL을 설치해야 합니다:
1. https://www.postgresql.org/download/windows/ 에서 다운로드
2. 설치 시 포트 5432 사용 (기본값)
3. postgres 사용자 비밀번호 설정: `Atech123!@#`

### 포트가 다른 경우

PostgreSQL이 다른 포트에서 실행 중이면 `app/config.py`에서 포트 번호를 변경하세요:
```python
DATABASE_URL: str = "postgresql://postgres:Atech123%21%40%23@127.0.0.1:5433/AI_HR"  # 포트 변경
```

### 방화벽 문제

Windows 방화벽이 PostgreSQL 연결을 차단할 수 있습니다:
1. Windows Defender 방화벽 설정 열기
2. 인바운드 규칙에서 PostgreSQL 허용 확인
