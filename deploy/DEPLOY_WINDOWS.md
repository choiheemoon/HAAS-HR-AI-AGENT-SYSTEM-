# Windows Server 배포 가이드 (HR AI Agent)

## 사전 요구사항

- **Windows Server 2016** 이상 (또는 Windows 10/11)
- **Python 3.10+** ([python.org](https://www.python.org/downloads/) 설치 시 "Add Python to PATH" 체크)
- **Node.js 18+** ([nodejs.org](https://nodejs.org/) LTS 권장)
- **PostgreSQL** (데이터베이스 서버 설치 및 DB `AI_HR` 생성)

---

## 1. 배포 폴더 복사

프로젝트 전체를 서버 원하는 경로에 복사합니다.  
예: `D:\Apps\88.HR AI AGENT`

---

## 2. 환경 설정 (선택)

1. 프로젝트 **루트**에 `.env` 파일 생성  
   - `deploy\.env.example` 내용을 참고하여 `.env` 생성 후 값 수정
2. **데이터베이스**: `DATABASE_URL`을 실제 PostgreSQL 연결 정보로 수정
3. **보안**: 운영 환경에서는 `SECRET_KEY`를 반드시 다른 값으로 변경

---

## 3. 설치 (최초 1회 또는 코드/의존성 변경 시)

**관리자 권한이 필요할 수 있습니다.**

1. `deploy\install.bat` 더블클릭 또는 명령 프롬프트에서 실행  
   ```
   deploy\install.bat
   ```
2. 수행 내용:
   - 백엔드: `pip install -r requirements.txt`
   - 프론트엔드: `npm install` → `npm run build`
3. 오류 없이 완료될 때까지 대기

**(선택) Python 가상환경 사용**

- 프로젝트 루트에서 `python -m venv venv` 실행 후
- `venv\Scripts\activate` 로 활성화한 뒤 `deploy\install.bat` 실행  
- 설치 스크립트가 `venv`가 있으면 자동으로 사용합니다.

---

## 4. 서버 실행

### 방법 A: 백엔드·프론트 한 번에 실행 (권장)

```
deploy\start_all.bat
```

- 백엔드(8000), 프론트(3000)가 각각 **새 CMD 창**에서 실행됩니다.
- 서버를 끄려면 해당 CMD 창을 닫거나 `deploy\stop_all.bat` 실행.

### 방법 B: 백엔드·프론트 각각 실행

- 백엔드만: `deploy\start_backend.bat`
- 프론트만: `deploy\start_frontend.bat`  
  (반드시 먼저 `deploy\install.bat`으로 빌드 완료된 상태여야 함)

---

## 5. 접속 확인

| 구분     | URL                    |
|----------|------------------------|
| 프론트엔드 | http://localhost:3000  |
| 백엔드 API | http://localhost:8000  |
| API 문서  | http://localhost:8000/docs |

외부에서 접속 시: `http://서버IP:3000` (방화벽에서 3000, 8000 포트 허용 필요)

---

## 6. 관리자 계정 생성 (최초 1회)

```
python scripts\create_admin_user.py
```

- 아이디: `admin` / 기본 비밀번호: `admin123`  
- 최초 로그인 후 비밀번호 변경 권장.

---

## 7. 서버 종료

- **방법 1**: 백엔드·프론트가 떠 있는 CMD 창 각각 닫기
- **방법 2**: `deploy\stop_all.bat` 실행 (8000, 3000 포트 사용 프로세스 종료)

---

## 8. Windows 서비스로 등록 (선택)

항상 켜 두려면 **NSSM** 또는 **Windows 서비스**로 등록할 수 있습니다.

### NSSM 사용 예

1. [NSSM](https://nssm.cc/download) 다운로드 후 압축 해제
2. 서비스 등록 예시 (관리자 CMD):

   ```bat
   nssm install HRAIAgentBackend "D:\Apps\88.HR AI AGENT\venv\Scripts\python.exe" "D:\Apps\88.HR AI AGENT\run.py"
   nssm set HRAIAgentBackend AppDirectory "D:\Apps\88.HR AI AGENT"
   nssm start HRAIAgentBackend
   ```

   프론트엔드는 Node로 `npm run start`를 실행하는 서비스를 같은 방식으로 추가하면 됩니다.

---

## 트러블슈팅

| 현상 | 확인 사항 |
|------|-----------|
| `python` 인식 안 됨 | Python 설치 시 "Add to PATH" 선택했는지 확인, 또는 `py run.py` 시도 |
| `npm` 인식 안 됨 | Node.js 설치 후 CMD 재실행 |
| DB 연결 오류 | PostgreSQL 실행 여부, `DATABASE_URL` 호스트/포트/DB명/비밀번호 확인 |
| 포트 사용 중 | `netstat -ano \| findstr :8000` 등으로 사용 프로세스 확인 후 종료 또는 포트 변경 |
| **화면이 하얗고 콘솔에 `webpack.js` / `main.js` / `react-refresh.js` / `_app.js` 404** | 아래 **「프론트 번들 404 / 빈 화면」** 참고 |

### 프론트 번들 404 / 빈 화면

브라우저가 `/_next/static/...` 아래 JS를 받지 못하면 React가 뜨지 않고 콘솔에 404가 연속으로 찍힙니다.

1. **운영은 반드시 `npm run build` 후 `npm run start`(또는 `npm run start:host`)**  
   `react-refresh.js`는 **`next dev` 전용**입니다. 예전에 `next dev`로 연 HTML이 **브라우저 캐시**에 남아 있으면, 지금은 `next start`인데도 개발용 스크립트를 요청해 404가 날 수 있습니다.  
   → **강력 새로고침(Ctrl+F5)** 또는 브라우저 캐시 삭제 후 다시 접속하세요.

2. **빌드 산출물 재생성**  
   서버에서:
   ```bat
   cd frontend
   rmdir /s /q .next
   npm run build
   npm run start:host
   ```
   또는 배포 루트에서 `deploy\install.bat` 을 다시 실행한 뒤 `deploy\start_all.bat` 으로 기동합니다.

3. **리버스 프록시(IIS / Nginx 등) 사용 시**  
   `/` 만 Node(3000)으로 넘기고 **`/_next/` 는 빠지면** 정적 청크가 백엔드(8000) 등으로 가며 404가 납니다. **`/_next` 전체**가 Next 서버(프론트 포트)로 프록시되는지 확인하세요. (`/api/` 만 백엔드로 보내도록 구성하는 것이 안전합니다.)

4. **외부 IP로 접속할 때**  
   `deploy\start_frontend.bat` / `start_all.bat` 은 `npm run start:host` 로 **0.0.0.0:3000** 에 바인딩합니다. 수동으로 `next start` 만 쓸 경우에도 필요하면 `next start -H 0.0.0.0 -p 3000` 을 사용하세요.

---

## 배포 폴더 구조

```
deploy/
  install.bat       # 의존성 설치 + 프론트 빌드
  start_backend.bat # 백엔드만 실행
  start_frontend.bat# 프론트만 실행
  start_all.bat     # 백엔드+프론트 동시 실행
  stop_all.bat      # 8000/3000 포트 프로세스 종료
  .env.example      # 환경 변수 예시
  DEPLOY_WINDOWS.md # 본 가이드
```
