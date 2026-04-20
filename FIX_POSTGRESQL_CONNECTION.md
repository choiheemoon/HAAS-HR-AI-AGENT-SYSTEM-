# PostgreSQL 연결 문제 해결

## 현재 상황

PostgreSQL 서비스는 실행 중이지만 연결이 거부되고 있습니다:
```
Connection refused (0x0000274D/10061)
Is the server running on that host and accepting TCP/IP connections?
```

## 원인

PostgreSQL이 TCP/IP 연결을 허용하지 않도록 설정되어 있을 수 있습니다.

## 해결 방법

### 방법 1: PostgreSQL 설정 파일 수정

1. **postgresql.conf 파일 찾기**
   - 일반 위치: `C:\Program Files\PostgreSQL\18\data\postgresql.conf`
   - 또는 pgAdmin에서: File → Preferences → Paths → PostgreSQL Binary Path 확인

2. **postgresql.conf 파일 편집**
   - `listen_addresses` 찾기
   - 다음으로 변경:
     ```conf
     listen_addresses = '*'  # 또는 'localhost'
     ```
   - `port` 확인:
     ```conf
     port = 5432
     ```

3. **pg_hba.conf 파일 편집**
   - 일반 위치: `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`
   - 파일 끝에 다음 추가:
     ```
     # IPv4 local connections:
     host    all             all             127.0.0.1/32            scram-sha-256
     host    all             all             ::1/128                 scram-sha-256
     ```

4. **PostgreSQL 서비스 재시작**
   ```powershell
   Restart-Service postgresql-x64-18
   ```

### 방법 2: pgAdmin에서 확인

1. **pgAdmin 열기**
2. **서버 우클릭 → Properties**
3. **Connection 탭 확인**:
   - Host: `localhost` 또는 `127.0.0.1`
   - Port: `5432`
   - Maintenance database: `postgres`

### 방법 3: 다른 포트 확인

PostgreSQL이 다른 포트에서 실행 중일 수 있습니다:

```powershell
# 모든 PostgreSQL 포트 확인
netstat -an | findstr "LISTENING" | findstr "543"
```

포트가 다르면 `app/config.py`에서 포트 번호를 변경하세요.

### 방법 4: PostgreSQL 재설정 (최후의 수단)

1. **pgAdmin에서 연결 테스트**
   - pgAdmin이 연결되면 설정은 정상입니다
   - pgAdmin이 연결되지 않으면 PostgreSQL 설정 문제입니다

2. **PostgreSQL 재설치** (필요시)
   - 기존 데이터베이스 백업
   - PostgreSQL 재설치
   - 설치 시 포트 5432, TCP/IP 연결 허용 확인

## 빠른 확인

다음 명령으로 PostgreSQL이 포트를 열고 있는지 확인:

```powershell
netstat -an | findstr ":5432"
```

결과가 없으면 PostgreSQL이 TCP/IP 연결을 허용하지 않는 것입니다.

## 참고

- PostgreSQL 18이 실행 중이지만 연결이 안 되는 경우, 대부분 설정 파일 문제입니다.
- `postgresql.conf`와 `pg_hba.conf` 파일을 수정한 후 반드시 서비스를 재시작해야 합니다.
