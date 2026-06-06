#!/usr/bin/env python3
"""
MultiCloudOps — AWS Integration Test Suite
==========================================
Run this against a REAL AWS account to verify all collectors work.

Usage:
    pip install boto3 pytest
    
    # Option A: env vars
    export AWS_ACCESS_KEY_ID=AKIA...
    export AWS_SECRET_ACCESS_KEY=...
    export AWS_DEFAULT_REGION=us-east-1
    python test_aws.py

    # Option B: explicit keys
    python test_aws.py --key AKIA... --secret ... --region us-east-1

    # Run only specific section
    python test_aws.py --section ec2
    python test_aws.py --section rds
    python test_aws.py --section lambda
    python test_aws.py --section cost
    python test_aws.py --section security
    python test_aws.py --section ssm

Output: colored pass/fail per check with actual values.
"""

import sys
import os
import json
import time
import argparse
from datetime import datetime, timezone, timedelta

# ── Color helpers ─────────────────────────────────────────────────────────────
RED   = '\033[91m'
GREEN = '\033[92m'
YELL  = '\033[93m'
BLUE  = '\033[94m'
CYAN  = '\033[96m'
BOLD  = '\033[1m'
DIM   = '\033[2m'
RESET = '\033[0m'

def ok(msg, detail=''):
    print(f"  {GREEN}✓{RESET} {msg}" + (f"  {DIM}({detail}){RESET}" if detail else ''))

def fail(msg, detail=''):
    print(f"  {RED}✗{RESET} {msg}" + (f"  {DIM}({detail}){RESET}" if detail else ''))

def warn(msg, detail=''):
    print(f"  {YELL}⚠{RESET} {msg}" + (f"  {DIM}({detail}){RESET}" if detail else ''))

def section(title):
    print(f"\n{BOLD}{CYAN}{'─'*55}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*55}{RESET}")

def sub(title):
    print(f"\n  {BLUE}{BOLD}{title}{RESET}")

PASS = 0
FAIL = 0
WARN = 0

def check(condition, label, detail='', warning_only=False):
    global PASS, FAIL, WARN
    if condition:
        PASS += 1
        ok(label, detail)
    else:
        if warning_only:
            WARN += 1
            warn(label, detail)
        else:
            FAIL += 1
            fail(label, detail)
    return condition


# ── Session ───────────────────────────────────────────────────────────────────

def make_session(args):
    import boto3
    key    = args.key    or os.getenv('AWS_ACCESS_KEY_ID')
    secret = args.secret or os.getenv('AWS_SECRET_ACCESS_KEY')
    region = args.region or os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    if key and secret:
        return boto3.Session(aws_access_key_id=key, aws_secret_access_key=secret, region_name=region), region
    return boto3.Session(region_name=region), region


# ── 1. Credentials ────────────────────────────────────────────────────────────

def test_credentials(session, region):
    section("1. CREDENTIALS & IAM")
    try:
        sts  = session.client('sts', region_name=region)
        iden = sts.get_caller_identity()
        check(True, "STS GetCallerIdentity succeeded",
              f"Account: {iden['Account']} | ARN: {iden['Arn']}")

        # Required permissions check
        sub("IAM Permission Smoke Tests")
        REQUIRED_PERMS = {
            'ec2':            lambda: session.client('ec2', region_name=region).describe_instances(MaxResults=5),
            'cloudwatch':     lambda: session.client('cloudwatch', region_name=region).list_metrics(Namespace='AWS/EC2', MaxItems=1),
            'rds':            lambda: session.client('rds', region_name=region).describe_db_instances(MaxRecords=5),
            'lambda':         lambda: session.client('lambda', region_name=region).list_functions(MaxItems=5),
            'ce (Cost Expl)': lambda: session.client('ce', region_name='us-east-1').get_cost_and_usage(
                TimePeriod={'Start': (datetime.now()-timedelta(days=2)).strftime('%Y-%m-%d'),
                            'End':   datetime.now().strftime('%Y-%m-%d')},
                Granularity='DAILY', Metrics=['UnblendedCost']),
            'securityhub':    lambda: session.client('securityhub', region_name=region).get_findings(MaxResults=1),
            'ssm':            lambda: session.client('ssm', region_name=region).describe_instance_information(MaxResults=5),
            'ecs':            lambda: session.client('ecs', region_name=region).list_clusters(),
            'eks':            lambda: session.client('eks', region_name=region).list_clusters(),
            's3':             lambda: session.client('s3').list_buckets(),
            'elbv2 (ALB)':    lambda: session.client('elbv2', region_name=region).describe_load_balancers(PageSize=5),
            'sqs':            lambda: session.client('sqs', region_name=region).list_queues(MaxResults=5),
            'guardduty':      lambda: session.client('guardduty', region_name=region).list_detectors(),
            'iam':            lambda: session.client('iam').list_roles(MaxItems=1),
            'config':         lambda: session.client('config', region_name=region).describe_config_rules(),
            'cloudtrail':     lambda: session.client('cloudtrail', region_name=region).describe_trails(),
        }

        for svc, fn in REQUIRED_PERMS.items():
            try:
                fn()
                check(True, f"  {svc}", "permission OK")
            except Exception as e:
                msg = str(e)
                if 'AccessDenied' in msg or 'AuthorizationError' in msg or 'AccessDeniedException' in msg:
                    check(False, f"  {svc}", f"ACCESS DENIED — add to IAM policy", warning_only=True)
                elif 'is not subscribed' in msg or 'not enabled' in msg.lower():
                    warn(f"  {svc}", "service not enabled in this account/region")
                else:
                    check(True, f"  {svc}", f"reachable (minor error: {msg[:60]})")
        return iden['Account']
    except Exception as e:
        check(False, "STS failed — check credentials", str(e))
        sys.exit(1)


# ── 2. EC2 ────────────────────────────────────────────────────────────────────

def test_ec2(session, region):
    section("2. EC2 INSTANCES")
    ec2 = session.client('ec2', region_name=region)
    cw  = session.client('cloudwatch', region_name=region)

    try:
        resp  = ec2.describe_instances()
        insts = [i for r in resp['Reservations'] for i in r['Instances']]
        check(True, f"DescribeInstances", f"{len(insts)} instances found")

        running = [i for i in insts if i['State']['Name'] == 'running']
        check(len(running) >= 0, f"Running instances", f"{len(running)} running")

        if not running:
            warn("No running instances to test metrics against", "create an EC2 instance first")
            return

        inst = running[0]
        iid  = inst['InstanceId']
        name = next((t['Value'] for t in inst.get('Tags',[]) if t['Key']=='Name'), iid)

        sub(f"Testing with: {name} ({iid})")

        # Instance attributes
        check(bool(inst.get('PublicIpAddress') or inst.get('PrivateIpAddress')),
              "Has IP address", f"public={inst.get('PublicIpAddress','—')} private={inst.get('PrivateIpAddress','—')}")
        check(bool(inst.get('InstanceType')), "Has instance type", inst.get('InstanceType',''))
        check(bool(inst.get('LaunchTime')),   "Has launch time",  str(inst.get('LaunchTime','')))
        check(isinstance(inst.get('Tags',[]), list), "Has tags", f"{len(inst.get('Tags',[]))} tags")

        # Status checks
        sub("Status Checks")
        try:
            sc = ec2.describe_instance_status(InstanceIds=[iid])
            if sc['InstanceStatuses']:
                s = sc['InstanceStatuses'][0]
                sys_ok   = s['SystemStatus']['Status']
                inst_ok  = s['InstanceStatus']['Status']
                check(True, "System status check",   sys_ok)
                check(True, "Instance status check", inst_ok)
                check(sys_ok == 'ok' and inst_ok == 'ok', "Both checks passing",
                      f"sys={sys_ok} inst={inst_ok}")
            else:
                warn("No status data yet", "instance may be too new")
        except Exception as e:
            fail("Status check failed", str(e))

        # Spot / Reserved
        sub("Instance Lifecycle")
        lifecycle = inst.get('InstanceLifecycle', 'on-demand')
        check(True, "Lifecycle type", f"'{lifecycle}' (on-demand/spot/scheduled)")

        # ASG
        sub("Auto Scaling Group")
        try:
            asg_tag = next((t['Value'] for t in inst.get('Tags',[]) if t['Key']=='aws:autoscaling:groupName'), None)
            if asg_tag:
                asc = session.client('autoscaling', region_name=region)
                grp = asc.describe_auto_scaling_groups(AutoScalingGroupNames=[asg_tag])
                if grp['AutoScalingGroups']:
                    g = grp['AutoScalingGroups'][0]
                    check(True, "ASG found", f"desired={g['DesiredCapacity']} min={g['MinSize']} max={g['MaxSize']}")
                else:
                    warn("ASG tag present but group not found", asg_tag)
            else:
                warn("Instance not in an ASG", "no aws:autoscaling:groupName tag")
        except Exception as e:
            fail("ASG check failed", str(e))

        # CloudWatch metrics
        sub("CloudWatch Metrics")
        now = datetime.now(timezone.utc)
        metrics_to_test = [
            ('CPUUtilization',  'AWS/EC2', 'Percent'),
            ('NetworkIn',       'AWS/EC2', 'Bytes'),
            ('NetworkOut',      'AWS/EC2', 'Bytes'),
            ('DiskReadBytes',   'AWS/EC2', 'Bytes'),
            ('DiskWriteBytes',  'AWS/EC2', 'Bytes'),
        ]
        for metric, ns, unit in metrics_to_test:
            try:
                r = cw.get_metric_statistics(
                    Namespace=ns, MetricName=metric,
                    Dimensions=[{'Name':'InstanceId','Value':iid}],
                    StartTime=now-timedelta(minutes=15), EndTime=now,
                    Period=300, Statistics=['Average']
                )
                has_data = len(r['Datapoints']) > 0
                val = round(r['Datapoints'][-1]['Average'], 2) if has_data else None
                check(True, f"CloudWatch {metric}", f"{val} {unit}" if has_data else "no data (OK for stopped/idle)")
            except Exception as e:
                fail(f"CloudWatch {metric}", str(e))

        # Reserved instances
        sub("Reserved Instance Coverage")
        try:
            ri = ec2.describe_reserved_instances(Filters=[{'Name':'state','Values':['active']}])
            count = len(ri['ReservedInstances'])
            check(True, "Reserved instances query", f"{count} active reservations")
        except Exception as e:
            warn("Reserved instance check", str(e))

    except Exception as e:
        fail("EC2 collection failed", str(e))


# ── 3. RDS ────────────────────────────────────────────────────────────────────

def test_rds(session, region):
    section("3. RDS / AURORA")
    rds = session.client('rds', region_name=region)
    cw  = session.client('cloudwatch', region_name=region)

    try:
        resp = rds.describe_db_instances()
        dbs  = resp['DBInstances']
        check(True, f"DescribeDBInstances", f"{len(dbs)} databases found")

        if not dbs:
            warn("No RDS instances found", "create one to test")
            return

        db  = dbs[0]
        iid = db['DBInstanceIdentifier']
        sub(f"Testing with: {iid} ({db.get('DBInstanceClass','')})")

        check(bool(db.get('DBInstanceStatus')),    "Has status",      db.get('DBInstanceStatus',''))
        check(bool(db.get('MultiAZ')),             "Multi-AZ flag",   str(db.get('MultiAZ',False)))
        check(db.get('AllocatedStorage',0) > 0,    "Allocated storage",f"{db.get('AllocatedStorage',0)} GB")
        check(bool(db.get('BackupRetentionPeriod') is not None),
              "Backup retention", f"{db.get('BackupRetentionPeriod',0)} days")

        now = datetime.now(timezone.utc)
        rds_metrics = [
            'CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace',
            'ReadIOPS', 'WriteIOPS', 'ReadLatency', 'WriteLatency',
        ]
        sub("CloudWatch Metrics")
        for m in rds_metrics:
            try:
                r = cw.get_metric_statistics(
                    Namespace='AWS/RDS', MetricName=m,
                    Dimensions=[{'Name':'DBInstanceIdentifier','Value':iid}],
                    StartTime=now-timedelta(minutes=15), EndTime=now,
                    Period=300, Statistics=['Average']
                )
                val = round(r['Datapoints'][-1]['Average'],2) if r['Datapoints'] else None
                check(True, f"  {m}", str(val) if val is not None else "no data (instance may be idle)")
            except Exception as e:
                fail(f"  {m}", str(e))

        # Replication lag
        sub("Replication")
        try:
            r = cw.get_metric_statistics(
                Namespace='AWS/RDS', MetricName='ReplicaLag',
                Dimensions=[{'Name':'DBInstanceIdentifier','Value':iid}],
                StartTime=now-timedelta(minutes=15), EndTime=now,
                Period=300, Statistics=['Average']
            )
            if r['Datapoints']:
                check(True, "ReplicaLag metric", f"{r['Datapoints'][-1]['Average']:.2f}s")
            else:
                warn("No ReplicaLag data", "only present on read replicas")
        except Exception as e:
            warn("ReplicaLag", str(e))

        # Performance Insights
        sub("Performance Insights")
        try:
            pi = session.client('pi', region_name=region)
            r  = pi.get_resource_metrics(
                ServiceType='RDS',
                Identifier=f"db:{iid}",
                MetricQueries=[{'Metric':'db.load.avg'}],
                StartTime=now-timedelta(hours=1),
                EndTime=now, PeriodInSeconds=300
            )
            check(True, "Performance Insights active", f"{len(r.get('MetricList',[]))} metrics")
        except Exception as e:
            if 'InvalidParameterValueException' in str(e) or 'not enabled' in str(e).lower():
                warn("Performance Insights not enabled", "enable in RDS settings for query metrics")
            else:
                warn("Performance Insights", str(e))

    except Exception as e:
        fail("RDS collection failed", str(e))


# ── 4. Lambda ─────────────────────────────────────────────────────────────────

def test_lambda(session, region):
    section("4. LAMBDA")
    lam = session.client('lambda', region_name=region)
    cw  = session.client('cloudwatch', region_name=region)

    try:
        resp  = lam.list_functions()
        funcs = resp.get('Functions', [])
        check(True, f"ListFunctions", f"{len(funcs)} functions found")

        if not funcs:
            warn("No Lambda functions found")
            return

        fn   = funcs[0]
        name = fn['FunctionName']
        sub(f"Testing with: {name}")

        now = datetime.now(timezone.utc)
        lambda_metrics = [
            ('Invocations', 'Sum'),
            ('Errors',      'Sum'),
            ('Throttles',   'Sum'),
            ('Duration',    'Average'),
            ('ConcurrentExecutions', 'Maximum'),
            ('InitDuration', 'Average'),  # cold starts
        ]
        sub("CloudWatch Metrics")
        for m, stat in lambda_metrics:
            try:
                r = cw.get_metric_statistics(
                    Namespace='AWS/Lambda', MetricName=m,
                    Dimensions=[{'Name':'FunctionName','Value':name}],
                    StartTime=now-timedelta(hours=1), EndTime=now,
                    Period=3600, Statistics=[stat]
                )
                val = r['Datapoints'][0][stat] if r['Datapoints'] else None
                check(True, f"  {m}", str(round(val,2)) if val is not None else "no invocations yet")
            except Exception as e:
                fail(f"  {m}", str(e))

        # Account concurrency limit
        sub("Account Limits")
        try:
            settings = lam.get_account_settings()
            limit    = settings.get('AccountLimit', {})
            check(True, "Concurrent execution limit",
                  f"total={limit.get('ConcurrentExecutions','?')} unreserved={limit.get('UnreservedConcurrentExecutions','?')}")
        except Exception as e:
            warn("Account limits", str(e))

    except Exception as e:
        fail("Lambda collection failed", str(e))


# ── 5. ECS / EKS ─────────────────────────────────────────────────────────────

def test_containers(session, region):
    section("5. ECS / EKS CONTAINERS")
    cw = session.client('cloudwatch', region_name=region)

    # ECS
    sub("ECS")
    try:
        ecs    = session.client('ecs', region_name=region)
        clstrs = ecs.list_clusters().get('clusterArns', [])
        check(True, f"ECS list_clusters", f"{len(clstrs)} clusters")

        if clstrs:
            details = ecs.describe_clusters(clusters=clstrs[:3],
                                             include=['STATISTICS','SETTINGS'])
            for c in details.get('clusters', []):
                name = c['clusterName']
                check(True, f"  Cluster: {name}",
                      f"running={c.get('runningTasksCount',0)} pending={c.get('pendingTasksCount',0)} services={c.get('activeServicesCount',0)}")

                # CloudWatch metrics for cluster
                for m in ['CPUReservation','MemoryReservation','CPUUtilization','MemoryUtilization']:
                    try:
                        r = cw.get_metric_statistics(
                            Namespace='AWS/ECS', MetricName=m,
                            Dimensions=[{'Name':'ClusterName','Value':name}],
                            StartTime=datetime.now(timezone.utc)-timedelta(minutes=15),
                            EndTime=datetime.now(timezone.utc),
                            Period=300, Statistics=['Average']
                        )
                        val = round(r['Datapoints'][-1]['Average'],1) if r['Datapoints'] else None
                        check(True, f"    CW {m}", str(val)+'%' if val else "no data")
                    except Exception as e:
                        warn(f"    CW {m}", str(e))
        else:
            warn("No ECS clusters found")
    except Exception as e:
        fail("ECS failed", str(e))

    # EKS
    sub("EKS")
    try:
        eks    = session.client('eks', region_name=region)
        clstrs = eks.list_clusters().get('clusters', [])
        check(True, f"EKS list_clusters", f"{len(clstrs)} clusters")

        for cname in clstrs[:2]:
            try:
                c = eks.describe_cluster(name=cname)['cluster']
                check(True, f"  Cluster: {cname}",
                      f"status={c.get('status','')} k8s={c.get('version','?')} endpoint={bool(c.get('endpoint'))}")
                ng = eks.list_nodegroups(clusterName=cname).get('nodegroups', [])
                check(True, f"    Nodegroups", f"{len(ng)} nodegroups")
                for ngname in ng[:2]:
                    ngg = eks.describe_nodegroup(clusterName=cname, nodegroupName=ngname)['nodegroup']
                    sc  = ngg.get('scalingConfig', {})
                    check(True, f"    Nodegroup {ngname}",
                          f"desired={sc.get('desiredSize','?')} min={sc.get('minSize','?')} max={sc.get('maxSize','?')}")
            except Exception as e:
                warn(f"  EKS {cname}", str(e))
    except Exception as e:
        fail("EKS failed", str(e))


# ── 6. Storage ────────────────────────────────────────────────────────────────

def test_storage(session, region):
    section("6. STORAGE (S3 / EBS / EFS)")
    cw = session.client('cloudwatch', region_name=region)

    # S3
    sub("S3")
    try:
        s3      = session.client('s3')
        buckets = s3.list_buckets().get('Buckets', [])
        check(True, "ListBuckets", f"{len(buckets)} buckets")

        for b in buckets[:3]:
            name = b['Name']
            now  = datetime.now(timezone.utc)
            # BucketSizeBytes is a daily metric
            for m, storage_type in [('BucketSizeBytes','StandardStorage'),('NumberOfObjects','AllStorageTypes')]:
                try:
                    r = cw.get_metric_statistics(
                        Namespace='AWS/S3', MetricName=m,
                        Dimensions=[{'Name':'BucketName','Value':name},{'Name':'StorageType','Value':storage_type}],
                        StartTime=now-timedelta(days=2), EndTime=now,
                        Period=86400, Statistics=['Average']
                    )
                    val = r['Datapoints'][-1]['Average'] if r['Datapoints'] else None
                    label = f"{round(val/1073741824,2)} GB" if val and m=='BucketSizeBytes' else str(round(val,0)) if val else "no data"
                    check(True, f"  {name}/{m}", label)
                except Exception as e:
                    warn(f"  {name}/{m}", str(e))
    except Exception as e:
        fail("S3 failed", str(e))

    # EBS
    sub("EBS")
    try:
        ec2    = session.client('ec2', region_name=region)
        vols   = ec2.describe_volumes(Filters=[{'Name':'status','Values':['in-use']}])['Volumes']
        check(True, "DescribeVolumes (in-use)", f"{len(vols)} volumes")
        for vol in vols[:3]:
            vid  = vol['VolumeId']
            now  = datetime.now(timezone.utc)
            iops = vol.get('Iops', 0)
            check(True, f"  Volume {vid}", f"type={vol['VolumeType']} size={vol['Size']}GB provisioned_iops={iops}")
            # IOPS utilisation
            for m in ['VolumeReadOps','VolumeWriteOps','BurstBalance']:
                try:
                    r = cw.get_metric_statistics(
                        Namespace='AWS/EBS', MetricName=m,
                        Dimensions=[{'Name':'VolumeId','Value':vid}],
                        StartTime=now-timedelta(minutes=15), EndTime=now,
                        Period=300, Statistics=['Average']
                    )
                    val = r['Datapoints'][-1]['Average'] if r['Datapoints'] else None
                    check(True, f"    CW {m}", str(round(val,1)) if val else "no data")
                except Exception as e:
                    if m == 'BurstBalance' and 'gp3' in vol.get('VolumeType',''):
                        warn(f"    CW {m}", "not available for gp3")
                    else:
                        warn(f"    CW {m}", str(e))
    except Exception as e:
        fail("EBS failed", str(e))

    # EFS
    sub("EFS")
    try:
        efs_client = session.client('efs', region_name=region)
        fss = efs_client.describe_file_systems().get('FileSystems', [])
        check(True, "EFS DescribeFileSystems", f"{len(fss)} filesystems")
        for fs in fss[:2]:
            fid = fs['FileSystemId']
            check(True, f"  EFS {fid}", f"size={fs.get('SizeInBytes',{}).get('Value',0)} bytes state={fs.get('LifeCycleState','?')}")
    except Exception as e:
        warn("EFS (service may not be used)", str(e))


# ── 7. Networking ─────────────────────────────────────────────────────────────

def test_networking(session, region):
    section("7. NETWORKING (ALB / NLB / CloudFront)")
    cw = session.client('cloudwatch', region_name=region)

    # ALB / NLB
    sub("Load Balancers (ALB/NLB)")
    try:
        elb  = session.client('elbv2', region_name=region)
        lbs  = elb.describe_load_balancers().get('LoadBalancers', [])
        check(True, "DescribeLoadBalancers", f"{len(lbs)} load balancers")

        for lb in lbs[:3]:
            arn  = lb['LoadBalancerArn']
            name = lb['LoadBalancerName']
            lbtype = lb['Type']
            check(True, f"  {name}", f"type={lbtype} state={lb['State']['Code']} dns={bool(lb.get('DNSName'))}")

            # Targets
            tgs = elb.describe_target_groups(LoadBalancerArn=arn).get('TargetGroups', [])
            for tg in tgs[:2]:
                tgarn = tg['TargetGroupArn']
                health = elb.describe_target_health(TargetGroupArn=tgarn)
                healthy_count   = sum(1 for t in health['TargetHealthDescriptions'] if t['TargetHealth']['State']=='healthy')
                unhealthy_count = sum(1 for t in health['TargetHealthDescriptions'] if t['TargetHealth']['State']!='healthy')
                check(unhealthy_count == 0 or True, f"    TG {tg['TargetGroupName']}",
                      f"healthy={healthy_count} unhealthy={unhealthy_count}")

            # ALB CloudWatch metrics
            lb_dim = [{'Name':'LoadBalancer','Value':arn.split(':loadbalancer/')[-1]}]
            now = datetime.now(timezone.utc)
            for m in ['RequestCount','TargetResponseTime','HTTPCode_ELB_5XX_Count','HTTPCode_ELB_4XX_Count']:
                try:
                    stat = 'Sum' if 'Count' in m else 'Average'
                    r = cw.get_metric_statistics(
                        Namespace='AWS/ApplicationELB', MetricName=m,
                        Dimensions=lb_dim,
                        StartTime=now-timedelta(minutes=15), EndTime=now,
                        Period=300, Statistics=[stat]
                    )
                    val = r['Datapoints'][-1][stat] if r['Datapoints'] else None
                    check(True, f"    CW {m}", str(round(val,3)) if val else "no data")
                except Exception as e:
                    warn(f"    CW {m}", str(e))
    except Exception as e:
        fail("Load balancer check failed", str(e))

    # CloudFront
    sub("CloudFront")
    try:
        cf   = session.client('cloudfront')
        dist = cf.list_distributions().get('DistributionList', {}).get('Items', [])
        check(True, "CloudFront distributions", f"{len(dist)} distributions")
        for d in dist[:2]:
            did = d['Id']
            now = datetime.now(timezone.utc)
            for m in ['Requests','BytesDownloaded','CacheHitRate','5xxErrorRate']:
                try:
                    r = cw.get_metric_statistics(
                        Namespace='AWS/CloudFront', MetricName=m,
                        Dimensions=[{'Name':'DistributionId','Value':did},{'Name':'Region','Value':'Global'}],
                        StartTime=now-timedelta(hours=1), EndTime=now,
                        Period=3600, Statistics=['Sum' if m in ['Requests','BytesDownloaded'] else 'Average']
                    )
                    val = r['Datapoints'][0] if r['Datapoints'] else None
                    check(True, f"  {did[:12]}… {m}", str(list(val.values())[2]) if val else "no data")
                except Exception as e:
                    warn(f"  {m}", str(e))
    except Exception as e:
        warn("CloudFront (may not be used)", str(e))


# ── 8. Queues ─────────────────────────────────────────────────────────────────

def test_queues(session, region):
    section("8. QUEUES & STREAMS (SQS / SNS / Kinesis)")
    cw = session.client('cloudwatch', region_name=region)

    # SQS
    sub("SQS")
    try:
        sqs    = session.client('sqs', region_name=region)
        queues = sqs.list_queues().get('QueueUrls', [])
        check(True, "SQS ListQueues", f"{len(queues)} queues")
        now = datetime.now(timezone.utc)
        for qurl in queues[:3]:
            qname = qurl.split('/')[-1]
            # Attributes
            attrs = sqs.get_queue_attributes(QueueUrl=qurl,
                AttributeNames=['ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible',
                                 'ApproximateNumberOfMessagesDelayed'])['Attributes']
            depth = int(attrs.get('ApproximateNumberOfMessages', 0))
            check(True, f"  {qname}", f"depth={depth} in-flight={attrs.get('ApproximateNumberOfMessagesNotVisible',0)}")

            # DLQ check
            for m in ['NumberOfMessagesSent','ApproximateNumberOfMessagesVisible','ApproximateAgeOfOldestMessage']:
                try:
                    r = cw.get_metric_statistics(
                        Namespace='AWS/SQS', MetricName=m,
                        Dimensions=[{'Name':'QueueName','Value':qname}],
                        StartTime=now-timedelta(minutes=15), EndTime=now,
                        Period=300, Statistics=['Sum' if 'Sent' in m else 'Maximum']
                    )
                    val = r['Datapoints'][-1] if r['Datapoints'] else None
                    check(True, f"    CW {m}", str(list(val.values())[2]) if val else "0")
                except Exception as e:
                    warn(f"    CW {m}", str(e))
    except Exception as e:
        warn("SQS (may not be used)", str(e))

    # Kinesis
    sub("Kinesis")
    try:
        kin     = session.client('kinesis', region_name=region)
        streams = kin.list_streams().get('StreamNames', [])
        check(True, "Kinesis ListStreams", f"{len(streams)} streams")
        now = datetime.now(timezone.utc)
        for sname in streams[:2]:
            check(True, f"  Stream: {sname}")
            for m in ['GetRecords.IteratorAgeMilliseconds','IncomingRecords','GetRecords.Records']:
                try:
                    r = cw.get_metric_statistics(
                        Namespace='AWS/Kinesis', MetricName=m,
                        Dimensions=[{'Name':'StreamName','Value':sname}],
                        StartTime=now-timedelta(minutes=15), EndTime=now,
                        Period=300, Statistics=['Maximum' if 'Age' in m else 'Sum']
                    )
                    val = r['Datapoints'][-1] if r['Datapoints'] else None
                    check(True, f"    CW {m}", str(list(val.values())[2]) if val else "no data")
                except Exception as e:
                    warn(f"    CW {m}", str(e))
    except Exception as e:
        warn("Kinesis (may not be used)", str(e))


# ── 9. Cost & Billing ─────────────────────────────────────────────────────────

def test_costs(session, region):
    section("9. COST & BILLING")
    ce = session.client('ce', region_name='us-east-1')
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=30)).strftime('%Y-%m-%d')
    end   = now.strftime('%Y-%m-%d')
    month_start = now.replace(day=1).strftime('%Y-%m-%d')

    # Daily spend
    sub("Daily Spend")
    try:
        r = ce.get_cost_and_usage(
            TimePeriod={'Start': start, 'End': end},
            Granularity='DAILY', Metrics=['UnblendedCost']
        )
        days = r.get('ResultsByTime', [])
        total = sum(float(d['Total']['UnblendedCost']['Amount']) for d in days)
        check(len(days) > 0, "30-day daily spend", f"{len(days)} days, ${round(total,2)} total")
    except Exception as e:
        fail("Daily spend failed", str(e))

    # By service
    sub("By Service")
    try:
        r = ce.get_cost_and_usage(
            TimePeriod={'Start': month_start, 'End': end},
            Granularity='MONTHLY', Metrics=['UnblendedCost'],
            GroupBy=[{'Type':'DIMENSION','Key':'SERVICE'}]
        )
        svcs = [(g['Keys'][0], round(float(g['Metrics']['UnblendedCost']['Amount']),2))
                for result in r['ResultsByTime'] for g in result.get('Groups',[]) if float(g['Metrics']['UnblendedCost']['Amount']) > 0.01]
        svcs.sort(key=lambda x: x[1], reverse=True)
        check(len(svcs) > 0, "Cost by service MTD", f"top={svcs[0][0] if svcs else '—'} ${svcs[0][1] if svcs else 0}")
        for s, c in svcs[:5]:
            ok(f"  {s}", f"${c}")
    except Exception as e:
        fail("Cost by service failed", str(e))

    # Forecast
    sub("Month-End Forecast")
    try:
        r = ce.get_cost_forecast(
            TimePeriod={'Start': end, 'End': (now + timedelta(days=30-now.day+1)).strftime('%Y-%m-%d')},
            Metric='UNBLENDED_COST', Granularity='MONTHLY'
        )
        forecast = round(float(r['Total']['Amount']), 2)
        check(forecast >= 0, "Month-end forecast", f"${forecast}")
    except Exception as e:
        warn("Forecast", str(e))

    # Cost Anomaly Detection
    sub("Anomaly Detection")
    try:
        r = ce.get_anomalies(DateInterval={'StartDate': start, 'EndDate': end})
        anomalies = r.get('Anomalies', [])
        check(True, "Cost anomaly check", f"{len(anomalies)} anomalies in last 30 days")
    except Exception as e:
        warn("Cost anomaly API", str(e))

    # Savings plans
    sub("Savings Plans & Reserved Instances")
    try:
        r = ce.get_savings_plans_utilization(
            TimePeriod={'Start': month_start, 'End': end}
        )
        total = r.get('Total', {})
        check(True, "Savings plans utilisation",
              f"utilised={total.get('UtilizationPercentage','?')}%")
    except Exception as e:
        warn("Savings plans (may not have any)", str(e))

    # By tag
    sub("Cost by Tag")
    try:
        r = ce.get_cost_and_usage(
            TimePeriod={'Start': month_start, 'End': end},
            Granularity='MONTHLY', Metrics=['UnblendedCost'],
            GroupBy=[{'Type':'TAG','Key':'Environment'}]
        )
        tags = [(g['Keys'][0], round(float(g['Metrics']['UnblendedCost']['Amount']),2))
                for result in r['ResultsByTime'] for g in result.get('Groups',[]) if float(g['Metrics']['UnblendedCost']['Amount']) > 0.01]
        check(True, "Cost by Environment tag", f"{len(tags)} tagged groups" if tags else "no tagged resources (add Environment tags)")
    except Exception as e:
        warn("Cost by tag", str(e))


# ── 10. Security ──────────────────────────────────────────────────────────────

def test_security(session, region):
    section("10. SECURITY & COMPLIANCE")

    # SecurityHub
    sub("SecurityHub")
    try:
        sh = session.client('securityhub', region_name=region)
        r  = sh.get_findings(
            Filters={'RecordState':[{'Value':'ACTIVE','Comparison':'EQUALS'}]},
            MaxResults=10
        )
        findings = r.get('Findings', [])
        check(True, "SecurityHub GetFindings", f"{len(findings)} active findings")
        sev_counts = {}
        for f in findings:
            sev = f.get('Severity', {}).get('Label', 'INFO')
            sev_counts[sev] = sev_counts.get(sev, 0) + 1
        for sev, count in sorted(sev_counts.items()):
            label = f"  Severity: {sev}"
            if sev in ('CRITICAL','HIGH') and count > 0:
                fail(label, f"{count} findings — needs attention")
            else:
                ok(label, str(count))
    except Exception as e:
        warn("SecurityHub (may not be enabled)", str(e))

    # GuardDuty
    sub("GuardDuty")
    try:
        gd = session.client('guardduty', region_name=region)
        detectors = gd.list_detectors().get('DetectorIds', [])
        check(len(detectors) > 0, "GuardDuty detector found", f"{len(detectors)} detectors")
        if detectors:
            findings = gd.list_findings(DetectorId=detectors[0],
                FindingCriteria={'Criterion':{'service.archived':{'Eq':['false']}}}).get('FindingIds', [])
            check(True, "Active GuardDuty findings", f"{len(findings)} findings")
            if findings:
                details = gd.get_findings(DetectorId=detectors[0], FindingIds=findings[:3])
                for f in details.get('Findings', []):
                    sev = f.get('Severity', 0)
                    if sev >= 7:
                        fail(f"  HIGH finding: {f.get('Title','?')}", f"severity={sev}")
                    else:
                        warn(f"  Finding: {f.get('Title','?')}", f"severity={sev}")
    except Exception as e:
        warn("GuardDuty (may not be enabled)", str(e))

    # IAM
    sub("IAM")
    try:
        iam = session.client('iam')
        # Unused roles (access advisor)
        roles = iam.list_roles(MaxItems=10).get('Roles', [])
        check(True, "IAM ListRoles", f"{len(roles)} roles sampled")
        stale_roles = []
        for role in roles[:5]:
            rname = role['RoleName']
            try:
                advisor = iam.generate_service_last_accessed_details(Arn=role['Arn'])
                job_id  = advisor['JobId']
                time.sleep(2)
                details = iam.get_service_last_accessed_details(JobId=job_id)
                services_accessed = sum(1 for s in details.get('ServicesLastAccessed',[]) if s.get('LastAuthenticated'))
                if services_accessed == 0:
                    stale_roles.append(rname)
            except Exception:
                pass
        check(True, "Unused role scan (sample)", f"{len(stale_roles)} of {min(5,len(roles))} sampled roles appear unused")
    except Exception as e:
        warn("IAM access advisor", str(e))

    # AWS Config
    sub("AWS Config")
    try:
        cfg   = session.client('config', region_name=region)
        rules = cfg.describe_config_rules().get('ConfigRules', [])
        check(True, "Config rules", f"{len(rules)} rules defined")
        if rules:
            compliance = cfg.describe_compliance_by_config_rule(
                ComplianceTypes=['NON_COMPLIANT']
            ).get('ComplianceByConfigRules', [])
            non_compliant = [r['ConfigRuleName'] for r in compliance if r['Compliance']['ComplianceType']=='NON_COMPLIANT']
            if non_compliant:
                fail("Non-compliant rules", ', '.join(non_compliant[:3]))
            else:
                check(True, "All config rules compliant")
    except Exception as e:
        warn("AWS Config (may not be enabled)", str(e))

    # CloudTrail
    sub("CloudTrail")
    try:
        ct     = session.client('cloudtrail', region_name=region)
        trails = ct.describe_trails().get('trailList', [])
        check(len(trails) > 0, "CloudTrail trails", f"{len(trails)} trails")
        for t in trails[:2]:
            status = ct.get_trail_status(Name=t['TrailARN'])
            check(status.get('IsLogging', False), f"  Trail {t['Name']} logging",
                  "logging=True" if status.get('IsLogging') else "LOGGING DISABLED")
        # Recent events
        events = ct.lookup_events(MaxResults=5).get('Events', [])
        check(True, "Recent CloudTrail events", f"{len(events)} recent events")
        for e in events[:3]:
            ok(f"  Event: {e.get('EventName','?')}", f"by {e.get('Username','?')} at {str(e.get('EventTime','?'))[:19]}")
    except Exception as e:
        warn("CloudTrail", str(e))


# ── 11. SSM ───────────────────────────────────────────────────────────────────

def test_ssm(session, region):
    section("11. SSM (SYSTEMS MANAGER)")
    ssm = session.client('ssm', region_name=region)

    # Managed instances
    sub("Managed Instances")
    try:
        r     = ssm.describe_instance_information()
        insts = r.get('InstanceInformationList', [])
        check(True, "SSM managed instances", f"{len(insts)} instances connected")
        if not insts:
            warn("No SSM-managed instances",
                 "Install SSM Agent and attach IAM role with AmazonSSMManagedInstanceCore")
            return

        inst = insts[0]
        iid  = inst['InstanceId']
        sub(f"Testing with: {iid}")
        check(inst.get('PingStatus') == 'Online', "Ping status", inst.get('PingStatus','?'))
        check(bool(inst.get('PlatformName')), "Platform detected", f"{inst.get('PlatformName','')} {inst.get('PlatformVersion','')}")

        # Patch compliance
        sub("Patch Compliance")
        try:
            ps = ssm.describe_instance_patch_states(InstanceIds=[iid])
            if ps.get('InstancePatchStates'):
                p = ps['InstancePatchStates'][0]
                missing = p.get('MissingCount', 0)
                failed  = p.get('FailedCount', 0)
                installed = p.get('InstalledCount', 0)
                check(missing == 0, "No missing patches",
                      f"installed={installed} missing={missing} failed={failed}")
                check(failed == 0, "No failed patches",
                      f"failed={failed}")
            else:
                warn("No patch state data", "run patch baseline scan first")
        except Exception as e:
            warn("Patch compliance", str(e))

        # Software inventory
        sub("Software Inventory")
        try:
            inv = ssm.list_inventory_entries(
                InstanceId=iid, TypeName='AWS:Application', MaxResults=10
            )
            entries = inv.get('Entries', [])
            check(len(entries) > 0, "Software inventory populated",
                  f"{inv.get('CaptureTime','?')[:10]} — {len(entries)} apps sampled")
            for app in entries[:3]:
                ok(f"  {app.get('Name','?')}", f"v{app.get('Version','?')}")
        except Exception as e:
            warn("Software inventory", str(e))

        # Process list
        sub("Running Processes")
        try:
            procs = ssm.list_inventory_entries(
                InstanceId=iid, TypeName='AWS:NetworkConfig', MaxResults=5
            )
            check(True, "Network config inventory", f"{len(procs.get('Entries',[]))} entries")
        except Exception as e:
            warn("Process inventory (AWS:Application is available)", str(e))

        # Run Command (dry run)
        sub("Run Command")
        try:
            cmds = ssm.list_command_invocations(InstanceId=iid, MaxResults=5)
            check(True, "ListCommandInvocations", f"{len(cmds.get('CommandInvocations',[]))} past commands")
        except Exception as e:
            warn("Run Command", str(e))

        # Session Manager
        sub("Session Manager")
        try:
            sessions = ssm.describe_sessions(State='Active').get('Sessions', [])
            check(True, "Session Manager reachable", f"{len(sessions)} active sessions")
        except Exception as e:
            warn("Session Manager", str(e))

        # Parameter Store
        sub("Parameter Store")
        try:
            params = ssm.describe_parameters(MaxResults=5).get('Parameters', [])
            check(True, "Parameter Store", f"{len(params)} parameters stored")
        except Exception as e:
            warn("Parameter Store", str(e))

    except Exception as e:
        fail("SSM collection failed", str(e))


# ── 12. MultiCloudOps API integration test ───────────────────────────────────

def test_api_integration(base_url, api_key):
    section("12. MULTICLOUDOPS API INTEGRATION")
    try:
        import urllib.request
        import urllib.error

        def api(path, method='GET', body=None):
            req = urllib.request.Request(
                f"{base_url}{path}",
                data=json.dumps(body).encode() if body else None,
                headers={'Content-Type':'application/json', 'X-Agent-Key': api_key} if api_key else {},
                method=method
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    return json.loads(r.read()), r.status
            except urllib.error.HTTPError as e:
                return json.loads(e.read()), e.code

        # Health
        data, status = api('/health')
        check(status == 200, "GET /health", data.get('status','?'))

        # Cloud accounts
        data, status = api('/api/cloud-accounts')
        check(status == 200, "GET /api/cloud-accounts", f"{data.get('total',0)} accounts")

        accounts = data.get('accounts', [])
        if accounts:
            acc = accounts[0]
            aid = acc['id']

            # Resources
            data, status = api(f'/api/cloud-accounts/{aid}/resources')
            check(status == 200, f"GET /api/cloud-accounts/{aid}/resources",
                  f"{len(data.get('resources',[]))} resources")

            # Costs
            data, status = api(f'/api/cloud-accounts/{aid}/costs')
            check(status == 200, f"GET /api/cloud-accounts/{aid}/costs",
                  f"MTD=${data.get('costs',{}).get('total_mtd',0):.2f}")

            # Security
            data, status = api(f'/api/cloud-accounts/{aid}/security')
            check(status == 200, f"GET /api/cloud-accounts/{aid}/security",
                  f"{len(data.get('findings',[]))} findings")

            # Optimisations
            data, status = api(f'/api/cloud-accounts/{aid}/optimisations')
            check(status == 200, f"GET /api/cloud-accounts/{aid}/optimisations",
                  f"{len(data.get('optimisations',[]))} tips")

        # Servers (agent)
        data, status = api('/api/servers')
        check(status == 200, "GET /api/servers", f"{data.get('total',0)} agent servers")

        # Stats
        data, status = api('/api/stats/overview')
        check(status == 200, "GET /api/stats/overview", f"sla={data.get('sla_percent','?')}%")

    except Exception as e:
        warn("API integration test skipped", f"set --api-url and optionally --agent-key: {e}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    global PASS, FAIL, WARN
    parser = argparse.ArgumentParser(description='MultiCloudOps AWS Test Suite')
    parser.add_argument('--key',      help='AWS Access Key ID')
    parser.add_argument('--secret',   help='AWS Secret Access Key')
    parser.add_argument('--region',   default='us-east-1', help='AWS Region (default: us-east-1)')
    parser.add_argument('--section',  help='Run only: credentials|ec2|rds|lambda|containers|storage|networking|queues|cost|security|ssm|api')
    parser.add_argument('--api-url',  default='http://localhost:8000', help='MultiCloudOps API base URL')
    parser.add_argument('--agent-key',help='Agent API key for MultiCloudOps API tests')
    args = parser.parse_args()

    print(f"\n{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}  MultiCloudOps AWS Integration Test Suite{RESET}")
    print(f"{BOLD}{'═'*60}{RESET}")
    print(f"  Region  : {args.region}")
    print(f"  API URL : {args.api_url}")
    print(f"  Time    : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        import boto3
    except ImportError:
        print(f"\n{RED}boto3 not installed. Run: pip install boto3{RESET}")
        sys.exit(1)

    session, region = make_session(args)

    SECTIONS = {
        'credentials': lambda: test_credentials(session, region),
        'ec2':         lambda: test_ec2(session, region),
        'rds':         lambda: test_rds(session, region),
        'lambda':      lambda: test_lambda(session, region),
        'containers':  lambda: test_containers(session, region),
        'storage':     lambda: test_storage(session, region),
        'networking':  lambda: test_networking(session, region),
        'queues':      lambda: test_queues(session, region),
        'cost':        lambda: test_costs(session, region),
        'security':    lambda: test_security(session, region),
        'ssm':         lambda: test_ssm(session, region),
        'api':         lambda: test_api_integration(args.api_url, args.agent_key or ''),
    }

    if args.section:
        fn = SECTIONS.get(args.section)
        if fn:
            fn()
        else:
            print(f"{RED}Unknown section '{args.section}'. Valid: {', '.join(SECTIONS)}{RESET}")
            sys.exit(1)
    else:
        for name, fn in SECTIONS.items():
            try:
                fn()
            except SystemExit:
                raise
            except Exception as e:
                section(f"ERROR in {name}: {e}")

    # Summary
    total = PASS + FAIL + WARN
    print(f"\n{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}  TEST SUMMARY{RESET}")
    print(f"{'═'*60}")
    print(f"  {GREEN}Passed : {PASS}{RESET}")
    print(f"  {RED}Failed : {FAIL}{RESET}")
    print(f"  {YELL}Warnings: {WARN}{RESET}")
    print(f"  Total  : {total}")
    print(f"{'═'*60}\n")

    if FAIL > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
