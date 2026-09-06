resource "aws_db_subnet_group" "main" {
  name       = "ems-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "rds" {
  name_prefix = "ems-rds-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "ems-rds-sg" }
}

resource "random_password" "db" {
  length  = 32
  special = false # avoid characters mysql2/JDBC connection strings need escaped
}

resource "aws_secretsmanager_secret" "db" {
  name = "ems/rds/master-password"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = random_password.db.result
}

# Multi-AZ MySQL 8.4-compatible primary + one read replica. The replica
# exists for reporting/analytics load (Phase 11's rollup/report queries) so
# that a slow ad-hoc report can never contend with checkout's own writes on
# the primary — `MYSQL_REPLICA_HOST` in `env.schema.ts` is exactly this
# endpoint.
resource "aws_db_instance" "primary" {
  identifier     = "ems-mysql"
  engine         = "mysql"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = 100
  max_allocated_storage = 500 # storage autoscaling — a bulk import spike must not hard-fail on disk-full
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "ems"
  username = "ems"
  password = random_password.db.result

  # ROW binlog format is what `docs/02 §22`'s 5-minute PITR target depends
  # on — the same reasoning `docker-compose.yml`'s own mysql service comment
  # gives for local dev.
  parameter_group_name = aws_db_parameter_group.mysql.name

  multi_az               = true
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 14
  backup_window           = "02:00-03:00" # low-traffic UTC window
  maintenance_window      = "sun:03:30-sun:04:30"

  deletion_protection      = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "ems-mysql-final"

  performance_insights_enabled = true
}

resource "aws_db_parameter_group" "mysql" {
  name   = "ems-mysql8"
  family = "mysql8.0"

  parameter {
    name  = "binlog_format"
    value = "ROW"
  }
  parameter {
    name  = "transaction_isolation" # matches docker-compose.yml's dev config — SELECT ... FOR UPDATE SKIP LOCKED needs READ-COMMITTED
    value = "READ-COMMITTED"
  }
  parameter {
    name  = "explicit_defaults_for_timestamp"
    value = "1"
  }
}

resource "aws_db_instance" "replica" {
  identifier          = "ems-mysql-replica"
  replicate_source_db = aws_db_instance.primary.identifier
  instance_class      = var.db_instance_class
  storage_encrypted   = true

  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true

  performance_insights_enabled = true
}
