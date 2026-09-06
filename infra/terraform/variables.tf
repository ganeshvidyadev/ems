variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "domain_name" {
  description = "Root domain the platform serves from, e.g. ems.example.com. Route53 zone must already exist."
  type        = string
  default     = "ems.example.com"
}

variable "db_instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "db_engine_version" {
  type    = string
  default = "8.0.35"
}

variable "redis_node_type" {
  type    = string
  default = "cache.r6g.large"
}

variable "documentdb_instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "eks_cluster_version" {
  type    = string
  default = "1.30"
}

variable "eks_node_instance_types" {
  type    = list(string)
  default = ["m6i.xlarge"]
}

variable "eks_node_desired_size" {
  type    = number
  default = 3
}

variable "eks_node_min_size" {
  type    = number
  default = 3
}

variable "eks_node_max_size" {
  type    = number
  default = 10
}

# See `dns.tf`'s own comment: unknown until the ingress-nginx controller is
# installed on the cluster this module creates, so left empty on the first
# apply and supplied on a second one.
variable "ingress_load_balancer_hostname" {
  type    = string
  default = ""
}
