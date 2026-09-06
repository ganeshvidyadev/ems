output "eks_cluster_name" {
  value = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "rds_primary_endpoint" {
  value = aws_db_instance.primary.endpoint
}

output "rds_replica_endpoint" {
  value = aws_db_instance.replica.endpoint
}

output "redis_cache_endpoint" {
  value = aws_elasticache_replication_group.cache.primary_endpoint_address
}

output "redis_queue_endpoint" {
  value = aws_elasticache_replication_group.queue.primary_endpoint_address
}

output "documentdb_endpoint" {
  value = aws_docdb_cluster.main.endpoint
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.bucket
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.media.domain_name
}

# Secrets Manager ARNs, not the values themselves — the values are pulled at
# deploy time (see `infra/k8s/secret.yaml.example`'s own comment), never
# printed by `terraform output` or written to a CI log.
output "db_secret_arn" {
  value = aws_secretsmanager_secret.db.arn
}

output "redis_secret_arn" {
  value = aws_secretsmanager_secret.redis.arn
}

output "docdb_secret_arn" {
  value = aws_secretsmanager_secret.docdb.arn
}
