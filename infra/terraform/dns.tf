# The zone is assumed to already exist (registrar delegation is a one-time,
# usually-manual step) — this only reads it, never creates or destroys the
# zone itself, so an `apply` can never accidentally drop the NS delegation
# that makes the whole domain resolve.
data "aws_route53_zone" "root" {
  name = var.domain_name
}

# Wildcard cert for `*.ems.example.com` (console + every tenant subdomain) —
# terminated by the ingress-nginx controller in `infra/k8s/ingress.yaml`,
# renewed automatically by cert-manager once installed. Per-tenant *custom*
# domain certificates are issued separately, by the platform's own ACME
# account (`AcmeAccountEntity`, docs/01 §7) via DNS-01 through
# `CloudflareDnsAdapter`, not by this resource.
resource "aws_acm_certificate" "wildcard" {
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "wildcard_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.wildcard_validation : r.fqdn]
}

# `media.ems.example.com` — must be issued in us-east-1 for CloudFront
# regardless of `var.aws_region` (see the aliased provider in providers.tf).
resource "aws_acm_certificate" "cdn" {
  provider          = aws.us_east_1
  domain_name       = "media.${var.domain_name}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cdn_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "cdn" {
  provider                = aws.us_east_1
  certificate_arn          = aws_acm_certificate.cdn.arn
  validation_record_fqdns  = [for r in aws_route53_record.cdn_validation : r.fqdn]
}

resource "aws_route53_record" "cdn" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "media.${var.domain_name}"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}

# `api.`/`console.`/`*.` all resolve to the same ingress load balancer — the
# Ingress resource itself decides which host gets the API vs. the storefront
# by matching `Host`, not DNS.
#
# `var.ingress_load_balancer_hostname` is a genuine bootstrap ordering
# problem: the NLB the ingress-nginx controller provisions doesn't exist
# until the EKS cluster is up and that controller is installed, which
# happens after this Terraform run. In practice this variable is supplied on
# a *second* `apply` once `kubectl get svc -n ingress-nginx` reports the
# hostname — not solvable in one pass without also managing the ingress
# controller's own Helm release from this same root module, which would
# couple infrastructure and cluster-workload lifecycles more tightly than is
# worth it here.
resource "aws_route53_record" "wildcard" {
  count   = var.ingress_load_balancer_hostname == "" ? 0 : 1
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "*.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [var.ingress_load_balancer_hostname]
}

# The zone apex cannot hold a literal CNAME (it must coexist with the zone's
# own NS/SOA records) — Route53's alias mechanism is the only way to point
# an apex at another AWS resource, and that needs the load balancer's own
# hosted-zone id (from `data "aws_lb"`), not just its hostname. Left
# unmanaged here; point `var.domain_name` itself at the console via an alias
# record added once that data source can resolve the real NLB.
