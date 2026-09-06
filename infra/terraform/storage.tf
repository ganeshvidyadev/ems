# The bucket behind `StoragePort`'s S3 adapter — product media, CSV
# import/export files, generated reports (Phase 11's `ReportGenerationProcessor`).
resource "aws_s3_bucket" "media" {
  bucket = "ems-media-${var.environment}"
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Generated reports and CSV error reports are meant to expire — nobody
# should be able to find a 90-day-old presigned link still valid, and
# storage cost for disposable exports should not grow unbounded.
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "expire-generated-reports"
    status = "Enabled"
    filter { prefix = "tenants/" }
    expiration { days = 90 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "ems-media-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Fronts the bucket for the *public* product-image path only — presigned
# upload/download URLs (`StoragePort.presignUpload`/`presignDownload`) go
# straight to S3 and never through this distribution, since a CDN cannot
# usefully cache a URL that is valid for one request.
resource "aws_cloudfront_distribution" "media" {
  enabled             = true
  default_root_object = ""
  price_class         = "PriceClass_100" # US/Canada/Europe — widen if the merchant base globalizes

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "ems-media-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "ems-media-s3"
    viewer_protocol_policy  = "redirect-to-https"
    allowed_methods         = ["GET", "HEAD"]
    cached_methods          = ["GET", "HEAD"]
    cache_policy_id         = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed "CachingOptimized"
    compress                = true
  }

  aliases = ["media.${var.domain_name}"]

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
}

resource "aws_s3_bucket_policy" "media_cloudfront" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.media.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.media.arn }
      }
    }]
  })
}
