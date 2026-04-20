# HR AI Agent Frontend

HR AI Agent System의 웹 프론트엔드입니다.

## 기술 스택

- **Next.js 14** - React 프레임워크
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 스타일링
- **Axios** - API 통신
- **Lucide React** - 아이콘

## 설치 및 실행

### 1. 의존성 설치

```bash
cd frontend
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 열어 확인하세요.

### 3. 프로덕션 빌드

```bash
npm run build
npm start
```

## 주요 기능

- 📊 대시보드 - 인사 현황 한눈에 보기
- 👥 직원 관리 - 직원 정보 CRUD
- 💼 채용 관리 - 채용 공고 및 지원자 관리
- ⏰ 근태관리 - 출퇴근 기록 및 휴가 관리
- 💰 급여 관리 - 급여 계산 및 관리
- 📄 급여명세서 - 명세서 생성 및 조회
- 📈 인사리포트 - 다양한 인사 지표 분석
- 🧾 세금 관리 - 원천세 및 연말정산

## 프로젝트 구조

```
frontend/
├── app/              # Next.js App Router
│   ├── page.tsx      # 대시보드
│   ├── employees/    # 직원 관리
│   ├── recruitment/ # 채용 관리
│   ├── attendance/   # 근태관리
│   ├── payroll/      # 급여 관리
│   ├── payslip/      # 급여명세서
│   ├── reports/      # 인사리포트
│   └── tax/          # 세금 관리
├── components/        # 재사용 컴포넌트
│   └── layout/       # 레이아웃 컴포넌트
├── lib/              # 유틸리티 및 API 클라이언트
└── public/           # 정적 파일
```

## 환경 변수

`.env.local` 파일을 생성하고 다음을 설정하세요:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## API 연동

모든 API 호출은 `lib/api.ts`에서 관리됩니다. 백엔드 서버가 `http://localhost:8000`에서 실행 중이어야 합니다.
