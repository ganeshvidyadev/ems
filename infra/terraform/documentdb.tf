# MongoDB-compatible — this is where `LogBufferService` writes `api_logs`/
# `error_logs`/etc. and `storefront_events`/`search_queries` (docs/02 §20).
# DocumentDB, not a self-managed Mongo replica set, so backups/failover/patch
# management come from AWS rather than being another thing this platform's
# own runbooks have to cover from scratch.

resource "aws_docdb_subnet_group" "main" {
  name       = "ems-docdb"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "docdb" {
  name_prefix = "ems-docdb-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "ems-docdb-sg" }
}

resource "random_password" "docdb" {
  length  = 32
  special = false
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier      = "ems-logs"
  engine                  = "docdb"
  master_username         = "ems"
  master_password         = random_password.docdb.result
  db_subnet_group_name    = aws_docdb_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.docdb.id]

  backup_retention_period = 7
  preferred_backup_window = "02:00-03:00"
  storage_encrypted       = true
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "ems-logs-final"
}

# Two instances across AZs — logs are disposable-by-design (docs/02 §20:
# "nothing here is a source of truth"), so this is about *availability* of
# the log pipeline, not the data's own durability.
resource "aws_docdb_cluster_instance" "main" {
  count              = 2
  identifier         = "ems-logs-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.documentdb_instance_class
}

resource "aws_secretsmanager_secret" "docdb" {
  name = "ems/docdb/master-password"
}

resource "aws_secretsmanager_secret_version" "docdb" {
  secret_id     = aws_secretsmanager_secret.docdb.id
  secret_string = random_password.docdb.result
}
