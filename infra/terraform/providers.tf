terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # State is remote and locked on purpose: two engineers running `apply`
  # against local state at the same time is how a VPC gets created twice.
  # The bucket/table themselves are created once, out of band, by
  # `infra/terraform/bootstrap/` (not this root module — a backend can't
  # provision the bucket it stores its own state in).
  backend "s3" {
    bucket         = "ems-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ems-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ems"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront only ever accepts an ACM certificate issued in us-east-1,
# regardless of which region the distribution (or anything else) actually
# runs in — a second provider alias is the only way Terraform can request
# one there while the rest of the stack stays in `var.aws_region`.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "ems"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
