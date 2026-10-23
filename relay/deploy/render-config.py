#!/usr/bin/env python3
"""Local file rendering only. Never calls AWS or prints secrets."""
import json
import os
import pathlib
import re
import time

env = os.environ
out = pathlib.Path(env["SNAG_DEPLOY_DIR"]).expanduser()
out.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(out, 0o700)
region = env["AWS_REGION"]
account = env["AWS_ACCOUNT_ID"]
model = env["BEDROCK_MODEL_ID"]
secret = env["ORIGIN_SECRET"]
if not re.fullmatch(r"[a-f0-9]{64}", secret):
    raise SystemExit("ORIGIN_SECRET must be 64 hex characters")
if not re.fullmatch(r"[a-z]{2}-[a-z]+-\d", region) or not re.fullmatch(r"\d{12}", account):
    raise SystemExit("Invalid region/account")

def save(name, value):
    path = out / name
    path.write_text(json.dumps(value, indent=2) + "\n")
    os.chmod(path, 0o600)

policy = json.loads(pathlib.Path(__file__).with_name("iam-policy.json").read_text())
variables = {
    "AWS_REGION": region,
    "BEDROCK_MODEL_ID": model,
    "BEDROCK_MODEL_ARN": env.get("BEDROCK_MODEL_ARN", f"arn:aws:bedrock:{region}::foundation-model/{model}"),
    "MANTLE_PROJECT_ARN": env["MANTLE_PROJECT_ARN"],
}

def substitute(value):
    if isinstance(value, str):
        for name, replacement in variables.items():
            value = value.replace("${" + name + "}", replacement)
        return value
    if isinstance(value, list):
        return [substitute(item) for item in value]
    if isinstance(value, dict):
        return {k: substitute(v) for k, v in value.items()}
    return value

save("iam-policy.json", substitute(policy))
if env.get("ORIGIN_DNS"):
    # Zero minimum TTL makes no-cache/no-store authoritative for index/API paths.
    cache_policy = {
        "Name": "snag-static-" + account,
        "Comment": "Only hashed phone assets may cache; origin no-cache/no-store wins",
        "DefaultTTL": 300, "MaxTTL": 31536000, "MinTTL": 0,
        "ParametersInCacheKeyAndForwardedToOrigin": {
            "EnableAcceptEncodingGzip": True, "EnableAcceptEncodingBrotli": True,
            "HeadersConfig": {"HeaderBehavior": "none"},
            "CookiesConfig": {"CookieBehavior": "none"},
            "QueryStringsConfig": {"QueryStringBehavior": "none"},
        },
    }
    save("cache-policy.json", cache_policy)
    static_id = env.get("STATIC_CACHE_POLICY_ID", "4135ea2d-6df8-44a3-9df3-4b5a84be39ad")

    def behavior(path=None, health=False):
        value = {
            "TargetOriginId": "relay", "ViewerProtocolPolicy": "allow-all" if health else "redirect-to-https",
            "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
            "Compress": True, "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
            # Forward query read keys and the WebSocket handshake headers.
            "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",
        }
        if path:
            value["PathPattern"] = path
        return value

    static = behavior("assets/*")
    static["CachePolicyId"] = static_id
    paths = [behavior("ws"), behavior("p/*"), behavior("tts/*"), behavior("healthz", True), static]
    save("cloudfront.json", {
        "CallerReference": "snag-" + str(time.time_ns()), "Comment": "Snag and Brag relay",
        "Enabled": True, "DefaultRootObject": "", "PriceClass": "PriceClass_100",
        "Origins": {"Quantity": 1, "Items": [{
            "Id": "relay", "DomainName": env["ORIGIN_DNS"],
            "CustomHeaders": {"Quantity": 1, "Items": [{"HeaderName": "X-Relay-Origin", "HeaderValue": secret}]},
            "CustomOriginConfig": {"HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "http-only", "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]}, "OriginReadTimeout": 60, "OriginKeepaliveTimeout": 5},
        }]},
        "DefaultCacheBehavior": behavior(), "CacheBehaviors": {"Quantity": len(paths), "Items": paths},
        "ViewerCertificate": {"CloudFrontDefaultCertificate": True}, "HttpVersion": "http2", "IsIPV6Enabled": True,
        "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
        "Logging": {"Enabled": False, "IncludeCookies": False, "Bucket": "", "Prefix": ""},
        "CustomErrorResponses": {"Quantity": 5, "Items": [{"ErrorCode": code, "ErrorCachingMinTTL": 0} for code in [403, 404, 500, 502, 503]]},
    })

if env.get("PUBLIC_URL"):
    values = {
        "HOST": "127.0.0.1", "PORT": "8787", "PUBLIC_URL": env["PUBLIC_URL"],
        "AWS_REGION": region, "BEDROCK_MODEL_ID": model, "ORIGIN_SECRET": secret,
        "BEDROCK_WORKSPACE_ID": env["BEDROCK_WORKSPACE_ID"],
        "AI_MODE": env.get("DEPLOY_AI_MODE", "mock"), "POLLY_MODE": env.get("DEPLOY_POLLY_MODE", "mock"),
    }
    if env.get("POLLY_VOICE"):
        values["POLLY_VOICE"] = env["POLLY_VOICE"]
    if any(not re.fullmatch(r"[A-Za-z0-9_:/.-]+", v) for v in values.values()):
        raise SystemExit("Invalid environment value")
    path = out / "relay.env"
    path.write_text("\n".join(f"{k}={v}" for k, v in values.items()) + "\n")
    os.chmod(path, 0o600)

if env.get("CLOUDFRONT_DOMAIN"):
    save("health-check.json", {
        "FullyQualifiedDomainName": env["CLOUDFRONT_DOMAIN"], "Port": 80, "Type": "HTTP", "ResourcePath": "/healthz",
        "RequestInterval": 30, "FailureThreshold": 3,
    })
if env.get("ALERT_EMAIL"):
    save("budget.json", {"BudgetName": "snag-50-monthly", "BudgetLimit": {"Amount": "50", "Unit": "USD"}, "TimeUnit": "MONTHLY", "BudgetType": "COST"})
    save("budget-notifications.json", [{
        "Notification": {"NotificationType": kind, "ComparisonOperator": "GREATER_THAN", "Threshold": threshold, "ThresholdType": "PERCENTAGE"},
        "Subscribers": [{"SubscriptionType": "EMAIL", "Address": env["ALERT_EMAIL"]}],
    } for kind, threshold in [("ACTUAL", 80), ("FORECASTED", 100)]])
print("Deployment configuration rendered; no AWS calls made.")
