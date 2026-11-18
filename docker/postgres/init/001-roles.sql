-- Local development and CI only. Staging/production roles are provisioned separately.
CREATE ROLE exam_app LOGIN PASSWORD 'local_app_only';
CREATE ROLE exam_worker LOGIN PASSWORD 'local_worker_only';
