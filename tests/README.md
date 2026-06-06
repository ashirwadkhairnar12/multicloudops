# MultiCloudOps — Test Suite

## Quick Start

```bash
cd tests
pip install boto3

# Full suite against your AWS account
python test_aws.py --key AKIA... --secret ... --region us-east-1

# Single section
python test_aws.py --key AKIA... --secret ... --section ec2
python test_aws.py --key AKIA... --secret ... --section cost
python test_aws.py --key AKIA... --secret ... --section security

# Using environment variables
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=ap-south-1
python test_aws.py

# Also test the MultiCloudOps API itself
python test_aws.py --api-url http://your-server:8000
```

## Sections

| Flag | Tests |
|------|-------|
| `credentials` | STS identity + all IAM permission checks |
| `ec2` | Instances, CloudWatch metrics, status checks, ASG, reserved |
| `rds` | DB instances, IOPS, replication lag, Performance Insights |
| `lambda` | Functions, invocations, errors, cold starts, concurrency |
| `containers` | ECS clusters + services, EKS nodegroups |
| `storage` | S3 size/objects/errors, EBS IOPS/burst, EFS |
| `networking` | ALB/NLB targets + latency, CloudFront cache |
| `queues` | SQS depth/age, Kinesis iterator lag |
| `cost` | Daily spend, MTD by service, forecast, anomalies, savings plans |
| `security` | SecurityHub, GuardDuty, IAM unused roles, Config, CloudTrail |
| `ssm` | Patch compliance, software inventory, parameter store |
| `api` | MultiCloudOps REST API endpoints |

## Output

```
══════════════════════════════════════════════════════
  MultiCloudOps AWS Integration Test Suite
══════════════════════════════════════════════════════
  Region  : us-east-1
  API URL : http://localhost:8000

─────────────────────────────────────────────────────
  1. CREDENTIALS & IAM
─────────────────────────────────────────────────────
  ✓ STS GetCallerIdentity  (Account: 418295705505)
  ✓   ec2                  (permission OK)
  ✓   cloudwatch           (permission OK)
  ⚠   guardduty            (service not enabled)
  ✗   securityhub          (ACCESS DENIED)
  ...

  TEST SUMMARY
  Passed : 47
  Failed : 2
  Warnings: 5
```

- ✓ green = pass
- ✗ red   = fail (exits with code 1)
- ⚠ yellow = warning (service not enabled / not used — not a failure)

## IAM Policy for Full Coverage

Attach this to the IAM user or role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:DescribeReservedInstances",
        "ec2:DescribeVolumes",
        "autoscaling:DescribeAutoScalingInstances",
        "autoscaling:DescribeAutoScalingGroups",
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "rds:DescribeDBInstances",
        "lambda:ListFunctions",
        "lambda:GetAccountSettings",
        "ecs:ListClusters",
        "ecs:DescribeClusters",
        "ecs:ListServices",
        "ecs:DescribeServices",
        "eks:ListClusters",
        "eks:DescribeCluster",
        "eks:ListNodegroups",
        "eks:DescribeNodegroup",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth",
        "cloudfront:ListDistributions",
        "sqs:ListQueues",
        "sqs:GetQueueAttributes",
        "kinesis:ListStreams",
        "kinesis:DescribeStream",
        "ce:GetCostAndUsage",
        "ce:GetCostForecast",
        "ce:GetAnomalies",
        "ce:GetSavingsPlansUtilization",
        "securityhub:GetFindings",
        "guardduty:ListDetectors",
        "guardduty:ListFindings",
        "guardduty:GetFindings",
        "iam:ListRoles",
        "iam:GenerateServiceLastAccessedDetails",
        "iam:GetServiceLastAccessedDetails",
        "config:DescribeConfigRules",
        "config:DescribeComplianceByConfigRule",
        "cloudtrail:DescribeTrails",
        "cloudtrail:GetTrailStatus",
        "cloudtrail:LookupEvents",
        "ssm:DescribeInstanceInformation",
        "ssm:DescribeInstancePatchStates",
        "ssm:ListInventoryEntries",
        "ssm:ListCommandInvocations",
        "ssm:DescribeSessions",
        "ssm:DescribeParameters",
        "pi:GetResourceMetrics",
        "compute-optimizer:GetEC2InstanceRecommendations"
      ],
      "Resource": "*"
    }
  ]
}
```

## Interpreting Results

### Warnings (⚠) — Not failures
These are expected if you don't use that service:
- `guardduty` — not enabled in all accounts
- `securityhub` — must be manually enabled
- `Performance Insights` — must be enabled per RDS instance
- `EFS`, `Kinesis`, `CloudFront` — may not be in use
- `ReplicaLag` — only on read replicas

### Failures (✗) — Need fixing
- `ACCESS DENIED` on any core service → add to IAM policy above
- Status check failures → instance may have a real problem
- CloudWatch returning no data for running instances → check CloudWatch agent or instance age

## Services Implemented vs Planned

| Service | Implemented | Notes |
|---------|-------------|-------|
| EC2 — CPU/Net/Disk (CloudWatch) | ✅ | Batched per-instance |
| EC2 — Status checks | ✅ | system + instance health |
| EC2 — ASG membership | ✅ | via DescribeAutoScalingInstances |
| EC2 — Spot/On-Demand lifecycle | ✅ | InstanceLifecycle field |
| EC2 — Reserved instance coverage | ✅ | DescribeReservedInstances |
| RDS — CPU/IOPS/Connections | ✅ | |
| RDS — Replication lag | ✅ | ReplicaLag metric |
| RDS — Backup retention | ✅ | BackupRetentionPeriod field |
| RDS — Performance Insights | ⚠ | Requires PI enabled per instance |
| Lambda — Invocations/Errors/Throttles | ✅ | |
| Lambda — Cold start frequency | ✅ | InitDuration metric |
| Lambda — Concurrent executions vs limit | ✅ | Account limit fetched |
| Lambda — Cost per function | ⚠ | CE groups by service not function |
| ECS — Cluster CPU/MEM | ✅ | |
| ECS — Services running/desired | ✅ | |
| EKS — Cluster + nodegroup scaling | ✅ | |
| EKS — Pod CPU/MEM (container level) | ❌ | Needs Container Insights |
| S3 — Size, object count | ✅ | Daily CloudWatch metrics |
| S3 — 4xx/5xx errors | ✅ | Request metrics |
| EBS — IOPS utilisation, burst balance | ✅ | |
| EFS — Throughput | ✅ | DescribeFileSystems |
| ALB/NLB — Requests, p50/p95/p99 latency | ✅ | |
| ALB/NLB — Healthy/unhealthy targets | ✅ | |
| ALB/NLB — WAF blocked requests | ❌ | Phase 4 |
| CloudFront — Cache hit ratio, bandwidth | ✅ | |
| SQS — Queue depth, oldest message age | ✅ | |
| SQS — Dead letter queue | ⚠ | DLQ is a separate queue, detected by name |
| Kinesis — Iterator age (consumer lag) | ✅ | |
| Cost — Daily/MTD/Forecast | ✅ | |
| Cost — By service | ✅ | |
| Cost — By tag | ✅ | Environment tag |
| Cost — Anomaly detection | ✅ | CE Anomalies API |
| Cost — Savings plan utilisation | ✅ | |
| SecurityHub — Findings by severity | ✅ | |
| GuardDuty — Threat detections | ✅ | |
| IAM — Unused roles (access advisor) | ✅ | Sampled (first 20 roles) |
| AWS Config — Non-compliant rules | ✅ | |
| CloudTrail — Recent events | ✅ | Last 20 events |
| SSM — Patch compliance | ✅ | |
| SSM — Software inventory | ✅ | AWS:Application type |
| SSM — Process list | ⚠ | Needs custom inventory collection |
| SSM — Run Command | ⚠ | API exposed but no UI trigger yet |
| SSM — Session Manager | ⚠ | Read-only check |
| SSM — Parameter Store | ✅ | Count only |
