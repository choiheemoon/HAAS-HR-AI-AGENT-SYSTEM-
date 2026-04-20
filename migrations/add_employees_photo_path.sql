-- 직원 증명사진 상대 경로 (예: employee_photos/12.jpg)
-- pgAdmin 등에서 수동 실행 가능. API 기동 시 db_schema_ensure 에서도 동일 DDL이 실행됩니다.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS photo_path VARCHAR(512);
