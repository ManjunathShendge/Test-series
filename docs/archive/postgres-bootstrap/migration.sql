CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE TABLE "bootstrap_state" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  CONSTRAINT "bootstrap_state_pkey" PRIMARY KEY ("id")
);
INSERT INTO "bootstrap_state" ("id", "version") VALUES ('schema', 1);
