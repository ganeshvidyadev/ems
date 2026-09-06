resource "aws_elasticache_subnet_group" "main" {
  name       = "ems-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "redis" {
  name_prefix = "ems-redis-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "ems-redis-sg" }
}

# Cache instance — `volatile-lru`, matching `docker-compose.yml`'s dev
# config: carts and OTPs live only here and must never be evicted to make
# room for cache entries.
resource "aws_elasticache_replication_group" "cache" {
  replication_group_id = "ems-redis-cache"
  description           = "EMS cache — sessions, carts, OTPs, response cache"
  engine                = "redis"
  engine_version        = "7.1"
  node_type             = var.redis_node_type
  num_cache_clusters    = 2 # primary + 1 replica, automatic failover
  automatic_failover_enabled = true
  multi_az_enabled           = true

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_cache.result

  parameter_group_name = aws_elasticache_parameter_group.cache.name
}

resource "aws_elasticache_parameter_group" "cache" {
  name   = "ems-redis-cache"
  family = "redis7"
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }
}

# Queue instance — `noeviction`, required by BullMQ (see `queue-names.enum.ts`'s
# own comment: losing an acknowledged-but-not-yet-processed job silently
# drops work). This is the entire reason two ElastiCache clusters exist
# rather than one: `maxmemory-policy` is cluster-wide, and a shared instance
# cannot be both.
resource "aws_elasticache_replication_group" "queue" {
  replication_group_id = "ems-redis-queue"
  description           = "EMS BullMQ — noeviction, must never lose a job"
  engine                = "redis"
  engine_version        = "7.1"
  node_type             = var.redis_node_type
  num_cache_clusters    = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_queue.result

  parameter_group_name = aws_elasticache_parameter_group.queue.name
}

resource "aws_elasticache_parameter_group" "queue" {
  name   = "ems-redis-queue"
  family = "redis7"
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "random_password" "redis_cache" {
  length  = 32
  special = false
}

resource "random_password" "redis_queue" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "redis" {
  name = "ems/redis/auth-tokens"
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    cache_auth_token = random_password.redis_cache.result
    queue_auth_token = random_password.redis_queue.result
  })
}
