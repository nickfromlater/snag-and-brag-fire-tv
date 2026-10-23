# EC2 + CloudFront deployment

The Oct 17 deployment and current family-test URLs are recorded in
[`docs/release/live.md`](../../docs/release/live.md). Run these steps with the
deployment identity; runtime inference uses only the instance role.

One Graviton `t4g.small`, Amazon Linux 2023, 8 GiB gp3, systemd relay on loopback
and nginx on port 80. CloudFront supplies the free `*.cloudfront.net` HTTPS name
and WSS. No load balancer, domain purchase, NAT gateway, bucket or database.
An Elastic IP keeps the origin stable across restarts. A service restart loses
rooms/photos by design; schedule releases between games.

`setup.sh` installs the native TTS encoder on Graviton: John Van Sickle's static
Linux arm64 FFmpeg 7.0.2, from the
[versioned archive](https://johnvansickle.com/ffmpeg/releases/ffmpeg-7.0.2-arm64-static.tar.xz).
SHA-256 is pinned to
`f4149bb2b0784e30e99bdda85471c9b5930d3402014e934a5098b41d0f7201b1`.
Setup checks that digest before extraction, checks the executable version, installs
the binary and GPL/readme files under `/opt/ffmpeg-7.0.2`, and links
`/usr/local/bin/ffmpeg` (already on the relay service PATH). Download/checksum
failure aborts setup before replacing an encoder. TTS conversion uses stdin/stdout
pipes; no speech file is written. The worker verified the archive checksum and
static AArch64 ELF, ran that binary and a silent AAC encode on Linux/VVD, and tested
checksum rejection. The live EC2 bootstrap verifies the same pin. Amazon Linux
2023 already has `curl-minimal`; setup retains it to avoid a package conflict.

These steps assume an existing AWS account, AWS CLI v2, `jq`, Python 3, and a
default VPC with a public subnet. The lead's deployment identity needs EC2,
IAM role/profile, CloudFront, Route 53 health check, SNS, CloudWatch and Budgets
administration and Mantle project create/get/update permissions; the runtime role
below has only model/voice permissions. Commands
create billable resources when the lead runs them. Do not run either smoke
script until the selected model is enabled and privacy configuration is checked.

## 1. Local variables, scoped IAM and budget

Run at the repository root in a fresh shell. Keep the generated configuration
directory and key in `~/secrets`; generated files are mode 0600 and contain the
origin header token. CLI queries below exclude that token from stdout.

```sh
set -a
source ~/secrets/aws.env
set +a
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export BEDROCK_MODEL_ID=anthropic.claude-opus-5  # the lead's enabled model
export BEDROCK_MODEL_ARN="arn:aws:bedrock:${AWS_REGION}::foundation-model/${BEDROCK_MODEL_ID}"
export ALERT_EMAIL=replace-with-owner-email
export ADMIN_CIDR=replace-with-your-public-ip/32
export SNAG_DEPLOY_DIR="$HOME/secrets/snag-deploy"
mkdir -p "$SNAG_DEPLOY_DIR"
chmod 700 "$SNAG_DEPLOY_DIR"
export ORIGIN_SECRET=$(openssl rand -hex 32)
pnpm install
read BEDROCK_WORKSPACE_ID MANTLE_PROJECT_ARN < <(pnpm --silent --filter relay setup:mantle)
export BEDROCK_WORKSPACE_ID MANTLE_PROJECT_ARN
python3 relay/deploy/render-config.py
aws iam create-role --role-name snag-relay --assume-role-policy-document file://relay/deploy/ec2-trust.json --query Role.Arn --output text
aws iam put-role-policy --role-name snag-relay --policy-name snag-runtime --policy-document "file://$SNAG_DEPLOY_DIR/iam-policy.json"
aws iam create-instance-profile --instance-profile-name snag-relay --query InstanceProfile.Arn --output text
aws iam add-role-to-instance-profile --instance-profile-name snag-relay --role-name snag-relay
aws budgets create-budget --account-id "$AWS_ACCOUNT_ID" --budget "file://$SNAG_DEPLOY_DIR/budget.json" --notifications-with-subscribers "file://$SNAG_DEPLOY_DIR/budget-notifications.json"
```

The monthly budget is $50 across the account, with email at 80% actual ($40)
and 100% forecast ($50). It is a notification, not an automatic resource cutoff.
The template grants `bedrock:InvokeModel` on exactly the named model and
`polly:SynthesizeSpeech` in the named region. Polly supports no voice-level
resource ARN, so that action alone uses `Resource: "*"`.

**Mantle permission adjustment:** this SDK calls `bedrock-mantle` with SigV4.
Current AWS docs require `bedrock-mantle:CreateInference`, scoped here to one
project and `bedrock-mantle:Model` equal to the configured model ID. The SDK
does not list projects/models and gets no discovery permissions. The setup
script creates a dedicated workspace, sets `data_retention.mode` to `none`,
reads it back, and returns its actual id/ARN. Export an existing
`BEDROCK_WORKSPACE_ID` before the setup command to reuse that workspace. The relay
sends its id in `anthropic-workspace-id`. The required
model-specific `InvokeModel` grant is retained as requested. See
[AWS inference permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference.html)
and [Mantle action/resource/condition reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock-mantle.html).
Do not enable Bedrock invocation payload logging or CloudFront request logging.
The dedicated workspace has zero data retention and the runtime cannot change
it; a model requiring retention is blocked by AWS and the relay falls back.
This enforces the photo rule beyond the local server. See
[AWS data retention controls](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html)
and [workspace headers](https://docs.aws.amazon.com/bedrock/latest/userguide/workspaces.html).

## 2. Instance and restricted origin

```sh
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
export SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
export SG_ID=$(aws ec2 create-security-group --group-name snag-relay --description 'CloudFront origin and scoped administration' --vpc-id "$VPC_ID" --query GroupId --output text)
export CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=$CF_PREFIX_LIST}]"
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$ADMIN_CIDR"
aws ec2 create-key-pair --key-name snag-relay --query KeyMaterial --output text > "$SNAG_DEPLOY_DIR/snag-relay.pem"
chmod 600 "$SNAG_DEPLOY_DIR/snag-relay.pem"
export AMI_ID=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text)
export INSTANCE_ID=$(aws ec2 run-instances --image-id "$AMI_ID" --instance-type t4g.small --key-name snag-relay --subnet-id "$SUBNET_ID" --security-group-ids "$SG_ID" --associate-public-ip-address --iam-instance-profile Name=snag-relay --metadata-options HttpTokens=required,HttpEndpoint=enabled --credit-specification CpuCredits=standard --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":8,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]' --user-data file://relay/deploy/setup.sh --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=snag-relay}]' --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID"
export EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOC" --query AssociationId --output text
export ORIGIN_DNS=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicDnsName' --output text)
```

Allow IAM/profile propagation before `run-instances` if AWS returns an invalid
profile error. The CloudFront managed prefix list has weight 55; with the SSH
rule this fits the usual 60-rule security-group quota. The instance exposes no
public port 8787. The shared origin header also prevents unrelated CloudFront
distributions from accessing the relay. CPU credit mode is standard to avoid
unlimited-mode surplus charges.

## 3. CloudFront HTTPS and WebSockets

```sh
python3 relay/deploy/render-config.py
export STATIC_CACHE_POLICY_ID=$(aws cloudfront create-cache-policy --cache-policy-config "file://$SNAG_DEPLOY_DIR/cache-policy.json" --query CachePolicy.Id --output text)
python3 relay/deploy/render-config.py
read CLOUDFRONT_ID CLOUDFRONT_DOMAIN < <(aws cloudfront create-distribution --distribution-config "file://$SNAG_DEPLOY_DIR/cloudfront.json" --query 'Distribution.[Id,DomainName]' --output text)
export CLOUDFRONT_ID CLOUDFRONT_DOMAIN
export PUBLIC_URL="https://$CLOUDFRONT_DOMAIN"
python3 relay/deploy/render-config.py
aws cloudfront wait distribution-deployed --id "$CLOUDFRONT_ID"
```

`ws`, `p/*`, `tts/*`, `healthz`, and the default behavior use AWS's managed
CachingDisabled policy (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`). AllViewerExceptHostHeader
(`b689b0a8-53d0-40ab-baf2-68738e2966ac`) forwards query read keys and the WebSocket
handshake headers. `assets/*` uses our zero-minimum-TTL policy so the origin's
one-year immutable hash caching works while `no-store` remains authoritative.
The relay heartbeat prevents idle WebSockets from reaching the 60-second origin
read timeout. [CloudFront WebSocket documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html).

Viewer requests redirect to HTTPS except `/healthz`, which also permits HTTP for
the cheaper basic health check. Its response contains counts/modes only. There
are no CloudFront access logs and no error-response cache retention. Origin
traffic is HTTP on the restricted AWS origin; viewer camera/photo traffic is HTTPS.

## 4. Ship source and the phone build; start systemd

Use the lead's merged checkout containing `phone/`. Build the phone locally; do
not ship local node_modules, credentials, reference media, or other workers' tools.

```sh
pnpm install
pnpm --filter phone build
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$SNAG_DEPLOY_DIR/release.tar.gz" --exclude=node_modules --exclude=.env --exclude='.env.*' --exclude=__pycache__ package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json shared/src shared/package.json relay/src relay/package.json relay/deploy phone/dist phone/package.json tv/package.json tvsim/package.json tools/director/package.json tools/eval/package.json tools/render-art/package.json tools/render-audio/package.json
scp -i "$SNAG_DEPLOY_DIR/snag-relay.pem" "$SNAG_DEPLOY_DIR/release.tar.gz" "$SNAG_DEPLOY_DIR/relay.env" "ec2-user@$ORIGIN_DNS:/tmp/"
ssh -i "$SNAG_DEPLOY_DIR/snag-relay.pem" "ec2-user@$ORIGIN_DNS" 'test -x /opt/node/bin/node && sudo tar -xzf /tmp/release.tar.gz -C /opt/snag/app && sudo chown -R snag:snag /opt/snag/app && sudo install -o root -g snag -m 640 /tmp/relay.env /etc/snag-relay.env && cd /opt/snag/app && sudo -u snag env PATH=/opt/node/bin:/usr/local/bin:/usr/bin pnpm --filter relay... install --prod --frozen-lockfile && sudo install -m 644 relay/deploy/nginx.conf /etc/nginx/nginx.conf && sudo install -m 644 relay/deploy/snag-relay.service /etc/systemd/system/snag-relay.service && sudo nginx -t && sudo systemctl daemon-reload && sudo systemctl enable --now nginx snag-relay && rm -f /tmp/release.tar.gz /tmp/relay.env'
curl --fail "$PUBLIC_URL/healthz"
```

Wait for user-data setup to finish before the SSH command (`/opt/node/bin/node`
and global pnpm must exist). Port 8787 is loopback; the service has no core dumps,
no swap, read-only system files and a 1.5 GiB memory ceiling. nginx has no access
or error logging, no cache, and no request/response spill-to-disk buffering.
Application logs in the journal contain only enum reasons and counts/latencies.
The startup env intentionally forces both mocks even though a model ID is set.

Ship every workspace's package manifest because pnpm 12 validates every importer
in the frozen lockfile. The `relay...` filter installs only relay/shared runtime
dependencies; it does not install TV tooling on EC2. `COPYFILE_DISABLE` and
`--no-xattrs` keep macOS metadata out of the source archive.

After the two manual smoke scripts succeed, set `DEPLOY_AI_MODE=bedrock` and
`DEPLOY_POLLY_MODE=aws`, rerender, upload/install `relay.env` as above and restart
`snag-relay` between games. Verify the service modes through `/healthz`, pair the
TV with WSS at `$PUBLIC_URL/ws` (replace `https` with `wss`), and test the real
phone camera over the CloudFront HTTPS page.

The Oct 17 family-test brief explicitly enables `AI_MODE=bedrock` while account
access is pending: its 403 response must return the game's fallback within four
seconds. Polly remains live with `POLLY_VOICE=Arthur`. Record model probes and
their five-call latency samples in `docs/release/live.md`; do not claim live
vision from a successful fallback. After service startup has settled, run
`node tools/release/verify-hosted.mjs "$PUBLIC_URL"` for HTTPS/WSS, live voice,
native encoding, a synthetic image read/fallback, and room-memory cleanup. This
makes one billable model attempt and one short Polly line; it saves no media.

## 5. Cheapest external `/healthz` alarm

A basic Route 53 HTTP health check reaches CloudFront and the real origin. It
needs no hosted zone and validates a successful HTTP status. `/healthz` permits
HTTP specifically so there is no redirect that could mask a dead origin. The
API behavior and error TTLs disable caching. Two bad CloudWatch periods after
three failed probe rounds trigger the alarm (roughly a few minutes).

```sh
export SNS_ARN=$(aws sns create-topic --region us-east-1 --name snag-health --query TopicArn --output text)
aws sns subscribe --region us-east-1 --topic-arn "$SNS_ARN" --protocol email --notification-endpoint "$ALERT_EMAIL" --query SubscriptionArn --output text
python3 relay/deploy/render-config.py
export HEALTH_CHECK_ID=$(aws route53 create-health-check --caller-reference "snag-$(date +%s)" --health-check-config "file://$SNAG_DEPLOY_DIR/health-check.json" --query HealthCheck.Id --output text)
aws cloudwatch put-metric-alarm --region us-east-1 --alarm-name snag-relay-health --namespace AWS/Route53 --metric-name HealthCheckStatus --dimensions "Name=HealthCheckId,Value=$HEALTH_CHECK_ID" --statistic Minimum --period 60 --evaluation-periods 2 --datapoints-to-alarm 2 --threshold 1 --comparison-operator LessThanThreshold --treat-missing-data breaching --alarm-actions "$SNS_ARN" --ok-actions "$SNS_ARN"
```

The owner confirms the SNS subscription email. Route 53 health metrics/alarms
are in `us-east-1` even if the EC2 origin is in another region. Basic checks are
$0 for the first 50 eligible same-account AWS endpoints, otherwise $0.50/month
per AWS endpoint. A standard CloudWatch alarm is about $0.10/month before its
free allowance; SNS email notifications are negligible at this volume. No
HTTPS/string-match/fast-interval extras. This is cheaper than a recurring
Synthetics canary. [Route 53 pricing](https://aws.amazon.com/route53/pricing/),
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/).

## Monthly estimate and teardown

Estimated US East, 730 hours/month, on-demand rates without trial credits:

| Item | Estimate |
| --- | ---: |
| t4g.small, assumed $0.0168/hour | $12.26 |
| One IPv4 address, $0.005/hour | $3.65 |
| 8 GiB gp3, assumed $0.08/GiB-month | $0.64 |
| Basic health check + standard alarm | $0.10–$0.60 |
| CloudFront below account pay-as-you-go free allocation | $0 |
| Baseline before AI/voice, taxes and overages | **about $17/month** |

AWS currently advertises a t4g.small 750-hour/month trial through Dec 31, 2026;
if the account qualifies, baseline falls to about $4.50. Do not assume those
credits when setting the budget. See [T4g trial](https://aws.amazon.com/ec2/instance-types/t4/),
[EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/),
[EBS pricing](https://aws.amazon.com/ebs/pricing/),
[IPv4 pricing](https://aws.amazon.com/vpc/pricing/), and
[CloudFront pricing/free allocation](https://aws.amazon.com/cloudfront/faqs/).

Polly neural audio **and** speech marks are billed separately at $16/million
characters each: 3,000 characters/game × two requests ≈ $0.096/game before any
free tier. [Polly pricing](https://aws.amazon.com/polly/pricing/).
Bedrock cost depends on the selected model and token usage. Reserve $20/month
for early AI tests; replace that allowance with measured usage from the lead's
synthetic smoke/game runs. Twelve reads/game × measured per-read charge gives
the game estimate. [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).
Plan roughly **$17 infrastructure + model usage + $0.096/game voice**, with the
$50 budget notifications in place before launching. Model usage is the main
unknown; no real calls have been measured by this worker.

Keep the backend available through Dec 3 per `DECISIONS.md`. To retire it, first
disable/delete the CloudFront distribution and static cache policy, remove the
health alarm/check and SNS subscription/topic, terminate the instance, release
its Elastic IP, then delete the key pair, security group, instance profile and
runtime role/policy. Retain the budget alarm if the account still uses AWS.
Stopping EC2 alone leaves the EBS and Elastic IP charges. Keep resource IDs in
the private deploy directory for cleanup, not in source control.
