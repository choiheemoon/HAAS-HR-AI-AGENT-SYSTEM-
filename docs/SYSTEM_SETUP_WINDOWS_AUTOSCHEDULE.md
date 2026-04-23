# Windows Server — 자동 스케줄(Celery) 서비스 구성 가이드

이 문서는 **예약 스케줄(근태 집계, 급여마스터 월집계, 리포트 메일 등)** 이 동작하도록 필요한 **소프트웨어 설치**, **환경 변수**, **Windows 서비스(NSSM) 등록** 절차를 정리합니다.

자동 실행 흐름 요약:

- **Celery Beat**: DB의 `job_schedules`를 주기적으로 확인해 실행 시각이 된 작업을 큐에 넣음 (`app/celery_app.py`의 `beat_schedule`).
- **Celery Worker**: 큐에서 작업을 꺼내 실제 로직 실행 (`app.tasks.job_schedule_tasks`).
- **Redis**: 메시지 브로커·결과 백엔드(기본 설정).
- **PostgreSQL**: 애플리케이션 DB(스케줄·실행 이력 저장).
- **FastAPI(API 서버)**: 스케줄 CRUD·수동 실행 API 제공(별도 프로세스).

---

## 1. 필수 설치 항목

| 구분 | 용도 | 비고 |
|------|------|------|
| Python 3.11+ | API, Worker, Beat 실행 | 가상환경 권장 |
| PostgreSQL | 앱 DB | `DATABASE_URL`과 동일 DB |
| Redis | Celery broker / result backend | 로컬 또는 전용 서버 |
| NSSM (Non-Sucking Service Manager) | Worker·Beat·Redis를 Windows 서비스로 등록 | https://nssm.cc |
| Git / 배포본 | 소스 배치 | 프로젝트 루트 기준 경로 통일 |

선택:

- **Memurai**: Windows에서 Redis 호환 서비스로 사용 가능(설치형).
- **Docker Desktop**: Redis만 컨테이너로 띄우는 방식도 가능.

---

## 2. 개발 PC 빠른 기동 (NSSM 없이)

저장소에 포함된 스크립트로 **포터블 Redis 다운로드(최초 1회) + Worker + Beat** 를 백그라운드로 띄울 수 있습니다.

```powershell
cd "D:\1.Atechsolution repository\88.HR AI AGENT"
pip install "celery[redis]==5.3.6"
powershell -ExecutionPolicy Bypass -File .\scripts\dev-schedule-up.ps1
```

중지(개발용):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-schedule-down.ps1
```

- Redis·Celery 바이너리/로그는 `.dev\redis`, `logs\` 에 둡니다(`.gitignore`에 `.dev/` 포함).
- 스크립트를 **여러 번 실행하면 Worker·Beat 프로세스가 중복**될 수 있으니, 재기동 전에 `dev-schedule-down.ps1` 로 정리하세요.

---

## 3. Python 환경

관리자 여부와 무관하게, 배포 사용자로 실행:

```powershell
cd "D:\1.Atechsolution repository\88.HR AI AGENT"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

`requirements.txt`에 **Celery + Redis 클라이언트**(`celery[redis]`)가 포함되어 있어야 Worker/Beat가 broker에 연결됩니다.

---

## 4. 환경 변수 (`.env`)

프로젝트 루트의 `.env`에 다음을 설정합니다. (값은 환경에 맞게 수정)

```env
# 데이터베이스 (필수)
DATABASE_URL=postgresql://사용자:비밀번호@호스트:포트/DB이름

# Celery (자동 스케줄 필수)
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/1
CELERY_TIMEZONE=Asia/Seoul

# 이메일 (스케줄 리포트 메일 발송 시)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
```

- `app/config.py`의 `Settings`가 위 변수를 읽고, `app/celery_app.py`가 broker/backend에 사용합니다.
- **API / Worker / Beat** 모두 동일한 `.env`가 로드되도록, 서비스 작업 디렉터리를 **프로젝트 루트**로 맞춥니다.

---

## 5. Redis 실행

### 5-1. 바이너리 + NSSM

1. `redis-server.exe`와 설정 파일(예: `redis.windows.conf`)을 고정 경로에 둡니다.  
   예: `C:\redis\redis-server.exe`, `C:\redis\redis.windows.conf`

2. 관리자 PowerShell:

```powershell
$nssm = "C:\nssm\nssm.exe"
$dir = "C:\redis"

& $nssm install HRAI-Redis "$dir\redis-server.exe" "$dir\redis.windows.conf"
& $nssm set HRAI-Redis AppDirectory $dir
& $nssm set HRAI-Redis Start SERVICE_AUTO_START

# 로그 (선택, 디렉터리는 미리 생성)
$logRoot = "D:\1.Atechsolution repository\88.HR AI AGENT\logs"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
& $nssm set HRAI-Redis AppStdout "$logRoot\redis.out.log"
& $nssm set HRAI-Redis AppStderr "$logRoot\redis.err.log"

Start-Service HRAI-Redis
```

### 5-2. 동작 확인

`redis-cli`가 있으면:

```powershell
redis-cli -h 127.0.0.1 -p 6379 ping
# 기대: PONG
```

---

## 6. Celery Worker / Beat — Windows 서비스(NSSM)

프로젝트 루트와 가상환경 Python 경로를 변수로 둡니다.

```powershell
$nssm = "C:\nssm\nssm.exe"
$root = "D:\1.Atechsolution repository\88.HR AI AGENT"
$py = "$root\venv\Scripts\python.exe"
```

### 6-1. Worker

```powershell
& $nssm install HRAI-Celery-Worker $py "-m celery -A app.celery_app:celery_app worker --pool=solo --loglevel=info"
& $nssm set HRAI-Celery-Worker AppDirectory $root
& $nssm set HRAI-Celery-Worker Start SERVICE_AUTO_START

New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null
& $nssm set HRAI-Celery-Worker AppStdout "$root\logs\celery-worker.out.log"
& $nssm set HRAI-Celery-Worker AppStderr "$root\logs\celery-worker.err.log"

Start-Service HRAI-Celery-Worker
```

Windows에서는 기본 풀 대신 **`--pool=solo`** 권장(프로세스 포크 이슈 회피).

### 6-2. Beat (스케줄러)

```powershell
& $nssm install HRAI-Celery-Beat $py "-m celery -A app.celery_app:celery_app beat --loglevel=info"
& $nssm set HRAI-Celery-Beat AppDirectory $root
& $nssm set HRAI-Celery-Beat Start SERVICE_AUTO_START

& $nssm set HRAI-Celery-Beat AppStdout "$root\logs\celery-beat.out.log"
& $nssm set HRAI-Celery-Beat AppStderr "$root\logs\celery-beat.err.log"

Start-Service HRAI-Celery-Beat
```

**주의:** Beat는 **인스턴스 1개만** 실행합니다. 여러 대 서버에 Beat를 동시에 띄우면 중복 스케줄이 발생할 수 있습니다.

### 6-3. 서비스 상태 확인

```powershell
Get-Service HRAI-Redis,HRAI-Celery-Worker,HRAI-Celery-Beat
```

---

## 7. API 서버 (참고)

스케줄 **등록·수정·즉시 실행**은 FastAPI가 처리합니다. 운영 시 IIS/역프록시 뒤에서 `uvicorn`을 서비스로 띄우거나, 별도 NSSM 서비스로 등록할 수 있습니다.

예 (개발·단일 서버):

```powershell
& $nssm install HRAI-API $py "-m uvicorn app.main:app --host 0.0.0.0 --port 8000"
& $nssm set HRAI-API AppDirectory $root
Start-Service HRAI-API
```

---

## 8. 배포 후 점검 체크리스트

1. `HRAI-Redis` → **Running**
2. `HRAI-Celery-Worker` → **Running** (로그에 broker 연결 오류 없음)
3. `HRAI-Celery-Beat` → **Running** (1분 주기 태스크 등록 확인)
4. DB에 `job_schedules` 테이블 존재 및 UI/API로 스케줄 등록 가능
5. `job_schedule_runs`에 실행 이력 쌓이는지 확인
6. 리포트 메일 사용 시 `.env`의 SMTP 설정 및 방화벽(587 등) 허용

---

## 9. 장애 대응 순서

1. Redis 중지/포트 충돌 → Worker·Beat가 작업을 못 받음  
2. `.env`의 `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` 오타  
3. 서비스 **AppDirectory**가 프로젝트 루트가 아니면 `.env` 미로드 가능  
4. Beat를 중복 기동 → 동일 스케줄 다중 실행

로그 위치: 기본 예시 `$root\logs\` 아래 `celery-*.log`, `redis.*.log`

---

## 10. 서비스 제거(재설치 시)

```powershell
Stop-Service HRAI-Celery-Worker,HRAI-Celery-Beat,HRAI-Redis -ErrorAction SilentlyContinue
& C:\nssm\nssm.exe remove HRAI-Celery-Worker confirm
& C:\nssm\nssm.exe remove HRAI-Celery-Beat confirm
& C:\nssm\nssm.exe remove HRAI-Redis confirm
```

---

## 11. 관련 소스 파일

| 파일 | 역할 |
|------|------|
| `app/celery_app.py` | Celery 앱, Beat 주기(분) 설정 |
| `app/tasks/job_schedule_tasks.py` | 스케줄 디스패치·실행 태스크 |
| `app/services/job_schedule_service.py` | 작업 유형별 실제 비즈니스 실행 |
| `app/models/job_schedule.py` | `job_schedules`, `job_schedule_runs` |
| `app/api/v1/system.py` | `/api/v1/system/job-schedules` CRUD·즉시 실행 |

---

문서 버전: 2026-04-23  
프로젝트: HR AI Agent
