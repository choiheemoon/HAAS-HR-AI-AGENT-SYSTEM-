-- Add created_by_id to parsed_applications (등록자). Run once if the column does not exist.
-- PostgreSQL:
ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS created_by_id INTEGER NULL;
-- Optional: add foreign key (run only if users.id exists and you want referential integrity)
-- ALTER TABLE parsed_applications ADD CONSTRAINT fk_parsed_applications_created_by
--   FOREIGN KEY (created_by_id) REFERENCES users(id);
