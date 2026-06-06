# Implementation Status vs Planned Features

## ✅ IMPLEMENTED
## ⚠️  PARTIAL
## ❌ NOT YET BUILT

### EC2
✅ CPU, NetworkIn/Out, DiskRead/Write (CloudWatch GetMetricData, batched)
✅ Instance state, type, launch time, public IP, private IP, tags
❌ Status checks (system + instance health) — DescribeInstanceStatus not called
❌ Reserved vs On-Demand, Spot interruption — DescribeInstanceAttribute not called
❌ Auto Scaling Group membership — DescribeAutoScalingInstances not called

### RDS
✅ CPU, connections, IOPS (read + write), free storage
✅ Multi-AZ flag
❌ Replication lag — ReplicaLag metric not fetched
❌ Backup retention status — not fetched
❌ Multi-AZ failover events — not fetched
❌ Query execution times (Performance Insights) — not enabled

### Lambda
✅ Invocations, errors, throttles, duration, error rate
❌ Cold start frequency — InitDuration metric not fetched
❌ Concurrent executions vs account limit — not fetched
❌ Cost per function — not broken out from Cost Explorer

### ECS / EKS
❌ ENTIRE SERVICE NOT IMPLEMENTED

### S3 / EBS / EFS
❌ ENTIRE SERVICE NOT IMPLEMENTED

### ALB / NLB / CloudFront
❌ ENTIRE SERVICE NOT IMPLEMENTED

### SQS / SNS / Kinesis
❌ ENTIRE SERVICE NOT IMPLEMENTED

### Cost & Billing
✅ Daily spend last 30 days
✅ MTD by service
✅ Month-end forecast
❌ Anomalous spend detection (Cost Anomaly Detection API)
❌ Savings plan / reserved instance utilisation
❌ Per-tag cost breakdown
❌ Per-account cost (for AWS Orgs)

### Security & Compliance
✅ SecurityHub findings by severity
❌ GuardDuty threat detections — not implemented
❌ IAM access advisor (unused roles) — not implemented
❌ Config compliance rules — not implemented
❌ CloudTrail audit log — not implemented

### SSM
✅ Patch compliance (compliant/non-compliant, missing count)
✅ SSM agent ping status, platform info
❌ Process list — ListInventory (AWS:Application) not called
❌ Software inventory — ListInventory not called
❌ Run Command — not exposed via API
❌ Parameter Store — not exposed
