-- Local development only. Production credentials are provisioned separately.
CREATE ROLE exam_app LOGIN PASSWORD 'local_app_only';
CREATE ROLE exam_worker LOGIN PASSWORD 'local_worker_only';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE exam_prep TO exam_app, exam_worker;
GRANT USAGE ON SCHEMA public TO exam_app, exam_worker;
CREATE SCHEMA pgboss AUTHORIZATION exam_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE exam_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO exam_app, exam_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE exam_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO exam_app, exam_worker;
