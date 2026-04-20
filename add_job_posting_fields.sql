-- 채용 공고 테이블에 새 필드 추가
-- 실행 방법: psql -U postgres -d AI_HR -f add_job_posting_fields.sql

ALTER TABLE job_postings
ADD COLUMN IF NOT EXISTS recruitment_fields JSON,
ADD COLUMN IF NOT EXISTS experience_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS education VARCHAR(100),
ADD COLUMN IF NOT EXISTS education_expected_graduate BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS job_role VARCHAR(100),
ADD COLUMN IF NOT EXISTS preferred_qualifications TEXT,
ADD COLUMN IF NOT EXISTS working_hours INTEGER,
ADD COLUMN IF NOT EXISTS remote_work_available BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS overseas_location BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS application_start_date DATE,
ADD COLUMN IF NOT EXISTS application_end_date DATE,
ADD COLUMN IF NOT EXISTS recruitment_process JSON,
ADD COLUMN IF NOT EXISTS required_documents TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS application_method JSON,
ADD COLUMN IF NOT EXISTS application_form VARCHAR(100),
ADD COLUMN IF NOT EXISTS number_of_recruits INTEGER,
ADD COLUMN IF NOT EXISTS industry JSON,
ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100),
ADD COLUMN IF NOT EXISTS contact_department VARCHAR(100),
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS contact_mobile VARCHAR(50),
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_private JSON;

-- 컬럼 추가 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'job_postings'
AND column_name IN (
    'recruitment_fields', 'experience_type', 'education', 'education_expected_graduate',
    'job_role', 'preferred_qualifications', 'working_hours', 'remote_work_available',
    'overseas_location', 'application_start_date', 'application_end_date',
    'recruitment_process', 'required_documents', 'notes', 'application_method',
    'application_form', 'number_of_recruits', 'industry', 'contact_person',
    'contact_department', 'contact_phone', 'contact_mobile', 'contact_email',
    'contact_private'
)
ORDER BY column_name;
