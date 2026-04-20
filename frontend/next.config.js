/** @type {import('next').NextConfig} */
// rewrites 목적지 (next build 시점 env가 박힘):
// - 프로덕션: API_BACKEND_URL 또는 NEXT_PUBLIC_API_URL 을 실제 FastAPI 주소로 설정 (예: http://서버IP:8000).
// - 비어 있으면 localhost:8000 으로 고정되어, 원격에서 접속 시 /api/* 가 엉뚱한 곳으로 가며 404가 납니다.
// 브라우저 직접 호출을 쓰려면 NEXT_PUBLIC_API_URL 만 설정해도 됩니다(frontend/lib/api.ts).
const API_BACKEND =
  process.env.API_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BACKEND.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
