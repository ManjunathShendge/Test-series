-- Applies to the current database; integration tests reuse this file for their
-- temporary databases. exam_migrator owns the schema; the API and worker can read
-- and write rows but cannot create or alter tables.
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO exam_app, exam_worker', current_database());
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO exam_app, exam_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE exam_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO exam_app, exam_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE exam_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO exam_app, exam_worker;
