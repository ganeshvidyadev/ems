-- Runs once on first container start (empty data dir).
-- Schema itself is owned by TypeORM migrations, never by this file —
-- `synchronize: false` in every environment (docs 02 §22).

CREATE DATABASE IF NOT EXISTS `ems`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Separate database for the integration/isolation test suites so a test run
-- can TRUNCATE freely without touching dev data.
CREATE DATABASE IF NOT EXISTS `ems_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON `ems`.*      TO 'ems'@'%';
GRANT ALL PRIVILEGES ON `ems_test`.* TO 'ems'@'%';

-- Required by migrations that create generated columns and partitioned tables.
GRANT SESSION_VARIABLES_ADMIN ON *.* TO 'ems'@'%';

FLUSH PRIVILEGES;
