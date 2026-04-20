-- 지원서 접수 및 파싱 테이블 (이메일 접수 PDF 업로드 → 파싱 → 자동 저장)
-- 지원서 종류: 5가지(form_type 1~5), 언어: ko/en/th

CREATE TABLE IF NOT EXISTS parsed_applications (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    original_filename VARCHAR(255) NOT NULL,
    pdf_file_path VARCHAR(500) NOT NULL,

    form_type INTEGER NOT NULL DEFAULT 1,
    document_language VARCHAR(10) NOT NULL DEFAULT 'ko',

    applicant_name VARCHAR(200),
    applicant_email VARCHAR(255),
    applicant_phone VARCHAR(50),

    parsed_data JSONB,
    raw_text TEXT,

    job_posting_id INTEGER REFERENCES job_postings(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'parsed'
);

CREATE INDEX IF NOT EXISTS idx_parsed_applications_form_type ON parsed_applications(form_type);
CREATE INDEX IF NOT EXISTS idx_parsed_applications_document_language ON parsed_applications(document_language);
CREATE INDEX IF NOT EXISTS idx_parsed_applications_status ON parsed_applications(status);
CREATE INDEX IF NOT EXISTS idx_parsed_applications_applicant_email ON parsed_applications(applicant_email);
CREATE INDEX IF NOT EXISTS idx_parsed_applications_created_at ON parsed_applications(created_at DESC);

COMMENT ON TABLE parsed_applications IS '이메일 접수 지원서(PDF) 업로드 후 파싱 저장 테이블';
COMMENT ON COLUMN parsed_applications.form_type IS '지원서 양식 종류 1~5';
COMMENT ON COLUMN parsed_applications.document_language IS '문서 작성 언어: ko(한국어), en(영어), th(태국어)';
