# Next.js 완전 가이드

## Next.js란?

Next.js는 **React 기반의 풀스택 웹 애플리케이션 프레임워크**입니다. Vercel에서 개발했으며, 프로덕션 환경에서 사용할 수 있는 기능들을 제공합니다.

## 주요 특징

### 1. 서버 사이드 렌더링 (SSR)
- 페이지가 서버에서 렌더링되어 초기 로딩 속도가 빠름
- SEO(검색 엔진 최적화)에 유리
- 소셜 미디어 공유 시 미리보기 이미지 생성 가능

### 2. 정적 사이트 생성 (SSG)
- 빌드 타임에 HTML을 미리 생성
- 매우 빠른 페이지 로딩 속도
- CDN에 배포 가능

### 3. 하이브리드 렌더링
- 페이지별로 SSR, SSG, CSR을 선택적으로 사용 가능
- 최적의 성능을 위해 각 페이지에 맞는 렌더링 방식 선택

### 4. 파일 기반 라우팅
- `pages/` 또는 `app/` 디렉토리의 파일 구조가 자동으로 라우트가 됨
- 복잡한 라우팅 설정 불필요

### 5. API Routes
- 백엔드 API를 Next.js 내부에서 구현 가능
- 서버리스 함수로 동작

### 6. 이미지 최적화
- 자동 이미지 최적화 및 lazy loading
- WebP 형식 자동 변환

### 7. 코드 스플리팅
- 자동으로 코드를 분할하여 필요한 부분만 로드
- 초기 번들 크기 감소

## Next.js 버전 비교

### Pages Router (v12 이하)
```
pages/
  ├── index.js          → /
  ├── about.js          → /about
  └── blog/
      └── [id].js       → /blog/:id
```

### App Router (v13+)
```
app/
  ├── page.tsx          → /
  ├── about/
  │   └── page.tsx      → /about
  └── blog/
      └── [id]/
          └── page.tsx  → /blog/:id
```

**우리 프로젝트는 App Router를 사용합니다!**

## App Router의 주요 개념

### 1. Layout (레이아웃)
```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Sidebar />
        {children}
      </body>
    </html>
  );
}
```
- 모든 페이지에 공통으로 적용되는 레이아웃
- 중첩 레이아웃 가능

### 2. Page (페이지)
```tsx
// app/page.tsx
export default function Home() {
  return <div>홈 페이지</div>;
}
```
- 각 라우트의 UI 컴포넌트

### 3. Server Components vs Client Components

#### Server Component (기본)
```tsx
// app/page.tsx
export default async function Page() {
  const data = await fetch('...'); // 서버에서 실행
  return <div>{data}</div>;
}
```
- 서버에서만 실행
- 번들 크기에 포함되지 않음
- 데이터베이스 직접 접근 가능

#### Client Component
```tsx
'use client'; // 필수!

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```
- 브라우저에서 실행
- `useState`, `useEffect` 등 React Hooks 사용 가능
- 인터랙티브한 UI 구현

### 4. Loading & Error Handling
```tsx
// app/loading.tsx
export default function Loading() {
  return <div>로딩 중...</div>;
}

// app/error.tsx
export default function Error({ error, reset }) {
  return (
    <div>
      <h2>오류 발생!</h2>
      <button onClick={reset}>다시 시도</button>
    </div>
  );
}
```

### 5. Route Handlers (API Routes)
```tsx
// app/api/users/route.ts
export async function GET() {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ success: true });
}
```

## 우리 프로젝트의 Next.js 구조

```
frontend/
├── app/
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 홈 페이지 (/)
│   ├── globals.css         # 전역 스타일
│   ├── employees/
│   │   └── page.tsx        # /employees
│   ├── recruitment/
│   │   └── page.tsx        # /recruitment
│   └── ...
├── components/             # 재사용 컴포넌트
│   └── layout/
│       ├── Sidebar.tsx
│       └── Header.tsx
├── lib/                    # 유틸리티
│   ├── api.ts             # API 클라이언트
│   └── utils.ts           # 헬퍼 함수
└── public/                # 정적 파일
```

## 주요 장점

### 1. 개발 경험
- ✅ Hot Module Replacement (HMR) - 코드 변경 시 즉시 반영
- ✅ TypeScript 기본 지원
- ✅ ESLint 통합
- ✅ 자동 코드 스플리팅

### 2. 성능
- ✅ 최적화된 번들 크기
- ✅ 이미지 최적화
- ✅ 폰트 최적화
- ✅ 자동 코드 스플리팅

### 3. SEO
- ✅ 서버 사이드 렌더링
- ✅ 메타데이터 관리 용이
- ✅ 구조화된 데이터 지원

### 4. 배포
- ✅ Vercel에 원클릭 배포
- ✅ 다른 플랫폼도 지원 (Netlify, AWS 등)
- ✅ 정적 사이트 생성 지원

## Next.js vs 순수 React

| 기능 | React | Next.js |
|------|-------|---------|
| 라우팅 | React Router 필요 | 파일 기반 자동 라우팅 |
| SSR | 직접 구현 필요 | 기본 제공 |
| 코드 스플리팅 | 수동 설정 | 자동 |
| 이미지 최적화 | 직접 구현 | 내장 기능 |
| API Routes | 별도 백엔드 필요 | 내장 가능 |
| SEO | 어려움 | 쉬움 |

## 실전 예제

### 데이터 페칭 (Server Component)
```tsx
// app/employees/page.tsx
export default async function EmployeesPage() {
  const res = await fetch('http://localhost:8000/api/v1/employees/');
  const employees = await res.json();
  
  return (
    <div>
      {employees.map(emp => (
        <div key={emp.id}>{emp.name}</div>
      ))}
    </div>
  );
}
```

### 클라이언트 인터랙션
```tsx
'use client';

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>증가</button>
    </div>
  );
}
```

### API Route
```tsx
// app/api/employees/route.ts
export async function GET() {
  const employees = await fetchEmployees();
  return Response.json(employees);
}
```

## 학습 리소스

1. **공식 문서**: https://nextjs.org/docs
2. **튜토리얼**: https://nextjs.org/learn
3. **예제**: https://github.com/vercel/next.js/tree/canary/examples

## 결론

Next.js는 **프로덕션 레디 웹 애플리케이션**을 빠르게 구축할 수 있는 강력한 프레임워크입니다. 특히:

- ✅ SEO가 중요한 웹사이트
- ✅ 빠른 로딩 속도가 필요한 애플리케이션
- ✅ 서버 사이드 로직이 필요한 풀스택 앱
- ✅ 대규모 프로젝트

에 매우 적합합니다!
