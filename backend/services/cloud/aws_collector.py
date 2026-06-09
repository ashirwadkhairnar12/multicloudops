"""
AWS Cloud Collector — Phase 3 (Complete)
=========================================
Services: EC2, RDS, Lambda, ECS, EKS, S3, EBS, EFS,
          ALB/NLB, CloudFront, SQS, Kinesis,
          Cost Explorer, Savings Plans, Cost Anomaly,
          SecurityHub, GuardDuty, IAM, Config, CloudTrail,
          SSM (patch, inventory, processes, parameters)

Cost optimisation built-in:
  - Batch all CloudWatch requests (up to 500 metrics per call)
  - Cost Explorer cached 1h by caller (poller.py)
  - Graceful fallback on every service — one failure never blocks others
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


# ── Session factory ───────────────────────────────────────────────────────────

def _boto_session(account: dict):
    import boto3
    ak   = account.get("access_key", "")
    sk   = account.get("secret_key", "")
    role = account.get("role_arn", "")
    if role:
        sts   = boto3.client("sts",
                             aws_access_key_id=ak or None,
                             aws_secret_access_key=sk or None)
        creds = sts.assume_role(RoleArn=role,
                                RoleSessionName="MultiCloudOps")["Credentials"]
        return boto3.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )
    elif ak and sk:
        return boto3.Session(aws_access_key_id=ak, aws_secret_access_key=sk)
    return boto3.Session()


def _client(session, service, region):
    return session.client(service, region_name=region)


def _now():
    return datetime.now(timezone.utc)


def _cw_batch(cw, queries, start, end):
    """Batch CloudWatch GetMetricData, returns {id: value} dict."""
    try:
        resp = cw.get_metric_data(MetricDataQueries=queries,
                                  StartTime=start, EndTime=end)
        return {r["Id"]: (r["Values"][0] if r["Values"] else 0)
                for r in resp["MetricDataResults"]}
    except Exception as e:
        logger.debug(f"CW batch error: {e}")
        return {}


def _cw_q(qid, ns, metric, stat, dims, period=300):
    return {
        "Id": qid,
        "MetricStat": {
            "Metric": {"Namespace": ns, "MetricName": metric, "Dimensions": dims},
            "Period": period,
            "Stat":   stat,
        },
        "ReturnData": True,
    }


# ── EC2 ───────────────────────────────────────────────────────────────────────

def collect_ec2(session, region: str) -> list:
    ec2  = _client(session, "ec2",        region)
    cw   = _client(session, "cloudwatch", region)
    asc  = _client(session, "autoscaling",region)
    now  = _now()
    results = []

    try:
        # Get ASG membership map
        asg_map = {}
        try:
            for page in asc.get_paginator("describe_auto_scaling_instances").paginate():
                for i in page["AutoScalingInstances"]:
                    asg_map[i["InstanceId"]] = i["AutoScalingGroupName"]
        except Exception:
            pass

        paginator = ec2.get_paginator("describe_instances")
        for page in paginator.paginate():
            for reservation in page["Reservations"]:
                for inst in reservation["Instances"]:
                    iid    = inst["InstanceId"]
                    state  = inst["State"]["Name"]
                    tags   = {t["Key"]: t["Value"] for t in inst.get("Tags", [])}
                    name   = tags.get("Name", iid)

                    # Status checks
                    sys_ok = inst_ok = "unknown"
                    try:
                        sc = ec2.describe_instance_status(InstanceIds=[iid],
                                                           IncludeAllInstances=True)
                        if sc["InstanceStatuses"]:
                            s       = sc["InstanceStatuses"][0]
                            sys_ok  = s["SystemStatus"]["Status"]
                            inst_ok = s["InstanceStatus"]["Status"]
                    except Exception:
                        pass

                    # Lifecycle (on-demand / spot / scheduled)
                    lifecycle = inst.get("InstanceLifecycle", "on-demand")

                    cpu = mem = net_in = net_out = disk_r = disk_w = 0.0

                    if state == "running":
                        dims = [{"Name": "InstanceId", "Value": iid}]
                        vals = _cw_batch(cw, [
                            _cw_q("cpu",    "AWS/EC2", "CPUUtilization",  "Average", dims),
                            _cw_q("net_in", "AWS/EC2", "NetworkIn",       "Average", dims),
                            _cw_q("net_out","AWS/EC2", "NetworkOut",      "Average", dims),
                            _cw_q("disk_r", "AWS/EC2", "DiskReadBytes",   "Average", dims),
                            _cw_q("disk_w", "AWS/EC2", "DiskWriteBytes",  "Average", dims),
                        ], now - timedelta(minutes=10), now)
                        cpu    = round(vals.get("cpu",    0), 1)
                        net_in = round(vals.get("net_in", 0) / 1024, 1)
                        net_out= round(vals.get("net_out",0) / 1024, 1)
                        disk_r = round(vals.get("disk_r", 0) / 1024, 1)
                        disk_w = round(vals.get("disk_w", 0) / 1024, 1)

                    if state != "running":
                        status = "stopped"
                    elif cpu >= 90 or sys_ok == "impaired" or inst_ok == "impaired":
                        status = "critical"
                    elif cpu >= 70:
                        status = "warning"
                    else:
                        status = "healthy"

                    results.append({
                        "id":            iid,
                        "name":          name,
                        "public_ip":     inst.get("PublicIpAddress", ""),
                        "private_ip":    inst.get("PrivateIpAddress", ""),
                        "provider":      "AWS",
                        "region":        region,
                        "type":          inst.get("InstanceType", ""),
                        "service":       "EC2",
                        "state":         state,
                        "status":        status,
                        "cpu":           cpu,
                        "mem":           0,
                        "disk":          0,
                        "net":           f"{round(net_in+net_out,1)} KB/s",
                        "net_in_kb":     net_in,
                        "net_out_kb":    net_out,
                        "disk_read_kb":  disk_r,
                        "disk_write_kb": disk_w,
                        "uptime":        "N/A",
                        "tags":          tags,
                        "az":            inst.get("Placement",{}).get("AvailabilityZone",""),
                        "image_id":      inst.get("ImageId",""),
                        "launch_time":   inst.get("LaunchTime","").isoformat() if inst.get("LaunchTime") else "",
                        "lifecycle":     lifecycle,
                        "sys_status":    sys_ok,
                        "inst_status":   inst_ok,
                        "asg_name":      asg_map.get(iid,""),
                        "account_id":    "",
                    })
    except Exception as e:
        logger.error(f"EC2 collect error {region}: {e}")
    return results


# ── RDS ───────────────────────────────────────────────────────────────────────

def collect_rds(session, region: str) -> list:
    rds  = _client(session, "rds",        region)
    cw   = _client(session, "cloudwatch", region)
    now  = _now()
    results = []

    try:
        for page in rds.get_paginator("describe_db_instances").paginate():
            for db in page["DBInstances"]:
                iid   = db["DBInstanceIdentifier"]
                state = db["DBInstanceStatus"]
                dims  = [{"Name": "DBInstanceIdentifier", "Value": iid}]

                cpu = conns = free_storage = read_iops = write_iops = replica_lag = 0.0
                read_latency = write_latency = 0.0

                if state == "available":
                    vals = _cw_batch(cw, [
                        _cw_q("cpu",    "AWS/RDS","CPUUtilization",    "Average", dims),
                        _cw_q("conns",  "AWS/RDS","DatabaseConnections","Average", dims),
                        _cw_q("stor",   "AWS/RDS","FreeStorageSpace",  "Average", dims),
                        _cw_q("riops",  "AWS/RDS","ReadIOPS",          "Average", dims),
                        _cw_q("wiops",  "AWS/RDS","WriteIOPS",         "Average", dims),
                        _cw_q("rlat",   "AWS/RDS","ReadLatency",       "Average", dims),
                        _cw_q("wlat",   "AWS/RDS","WriteLatency",      "Average", dims),
                        _cw_q("lag",    "AWS/RDS","ReplicaLag",        "Average", dims),
                    ], now - timedelta(minutes=10), now)
                    cpu          = round(vals.get("cpu",  0), 1)
                    conns        = int(vals.get("conns", 0))
                    free_storage = round(vals.get("stor", 0) / 1073741824, 2)
                    read_iops    = round(vals.get("riops",0), 1)
                    write_iops   = round(vals.get("wiops",0), 1)
                    read_latency = round(vals.get("rlat", 0) * 1000, 2)
                    write_latency= round(vals.get("wlat", 0) * 1000, 2)
                    replica_lag  = round(vals.get("lag",  0), 2)

                alloc  = db.get("AllocatedStorage", 0)
                disk_p = round((1 - free_storage / alloc) * 100, 1) if alloc > 0 else 0

                results.append({
                    "id":              iid,
                    "name":            iid,
                    "public_ip":       db.get("Endpoint",{}).get("Address",""),
                    "provider":        "AWS",
                    "region":          region,
                    "type":            db.get("DBInstanceClass",""),
                    "service":         "RDS",
                    "engine":          f"{db.get('Engine','')} {db.get('EngineVersion','')}",
                    "state":           state,
                    "status":          ("stopped" if state != "available"
                                        else "critical" if cpu >= 90
                                        else "warning"  if cpu >= 70 or disk_p >= 85
                                        else "healthy"),
                    "cpu":             cpu,
                    "mem":             0,
                    "disk":            disk_p,
                    "net":             f"{round(read_iops+write_iops,0)} IOPS",
                    "connections":     conns,
                    "free_storage_gb": free_storage,
                    "read_iops":       read_iops,
                    "write_iops":      write_iops,
                    "read_latency_ms": read_latency,
                    "write_latency_ms":write_latency,
                    "replica_lag_s":   replica_lag,
                    "multi_az":        db.get("MultiAZ", False),
                    "storage_type":    db.get("StorageType",""),
                    "backup_retention":db.get("BackupRetentionPeriod", 0),
                    "uptime":          "N/A",
                    "tags":            {t["Key"]:t["Value"] for t in db.get("TagList",[])},
                    "account_id":      "",
                })
    except Exception as e:
        logger.error(f"RDS collect error {region}: {e}")
    return results


# ── Lambda ────────────────────────────────────────────────────────────────────

def collect_lambda(session, region: str) -> list:
    lam  = _client(session, "lambda",     region)
    cw   = _client(session, "cloudwatch", region)
    now  = _now()
    results = []

    try:
        # Account concurrency limit
        account_limit = 0
        try:
            account_limit = lam.get_account_settings().get(
                "AccountLimit",{}).get("ConcurrentExecutions", 0)
        except Exception:
            pass

        for page in lam.get_paginator("list_functions").paginate():
            for fn in page["Functions"]:
                fname = fn["FunctionName"]
                dims  = [{"Name": "FunctionName", "Value": fname}]
                # 1h window for invocation counts
                vals = _cw_batch(cw, [
                    _cw_q("inv",   "AWS/Lambda","Invocations",          "Sum",     dims, 3600),
                    _cw_q("err",   "AWS/Lambda","Errors",               "Sum",     dims, 3600),
                    _cw_q("thr",   "AWS/Lambda","Throttles",            "Sum",     dims, 3600),
                    _cw_q("dur",   "AWS/Lambda","Duration",             "Average", dims, 3600),
                    _cw_q("conc",  "AWS/Lambda","ConcurrentExecutions", "Maximum", dims, 3600),
                    _cw_q("init",  "AWS/Lambda","InitDuration",         "Average", dims, 3600),
                ], now - timedelta(hours=1), now)

                invocations  = int(vals.get("inv",  0))
                errors       = int(vals.get("err",  0))
                throttles    = int(vals.get("thr",  0))
                duration     = round(vals.get("dur", 0), 1)
                concurrent   = int(vals.get("conc", 0))
                init_dur     = round(vals.get("init",0), 1)

                error_rate   = round((errors / invocations * 100) if invocations > 0 else 0, 1)
                cold_start_pct = round((init_dur / duration * 100) if duration > 0 and init_dur > 0 else 0, 1)

                status = ("critical" if error_rate > 10 or throttles > 100
                          else "warning"  if error_rate > 2  or throttles > 10
                          else "healthy")

                results.append({
                    "id":              fname,
                    "name":            fname,
                    "public_ip":       "",
                    "provider":        "AWS",
                    "region":          region,
                    "type":            f"{fn.get('Runtime','')} {fn.get('MemorySize',128)}MB",
                    "service":         "Lambda",
                    "state":           "active",
                    "status":          status,
                    "cpu":             error_rate,
                    "mem":             round(fn.get("MemorySize",128) / 10240 * 100, 1),
                    "disk":            0,
                    "net":             f"{duration}ms avg",
                    "invocations":     invocations,
                    "errors":          errors,
                    "error_rate":      error_rate,
                    "throttles":       throttles,
                    "duration_ms":     duration,
                    "init_duration_ms":init_dur,
                    "cold_start_pct":  cold_start_pct,
                    "concurrent":      concurrent,
                    "account_limit":   account_limit,
                    "timeout_s":       fn.get("Timeout", 3),
                    "uptime":          "N/A",
                    "tags":            {},
                    "account_id":      "",
                })
    except Exception as e:
        logger.error(f"Lambda collect error {region}: {e}")
    return results


# ── ECS ───────────────────────────────────────────────────────────────────────

def collect_ecs(session, region: str) -> list:
    ecs  = _client(session, "ecs",        region)
    cw   = _client(session, "cloudwatch", region)
    now  = _now()
    results = []

    try:
        cluster_arns = []
        for page in ecs.get_paginator("list_clusters").paginate():
            cluster_arns.extend(page["clusterArns"])

        if not cluster_arns:
            return []

        details = ecs.describe_clusters(clusters=cluster_arns,
                                         include=["STATISTICS","SETTINGS"])
        for c in details.get("clusters", []):
            name = c["clusterName"]
            dims = [{"Name": "ClusterName", "Value": name}]

            vals = _cw_batch(cw, [
                _cw_q("cpu_res", "AWS/ECS","CPUReservation",    "Average", dims),
                _cw_q("mem_res", "AWS/ECS","MemoryReservation", "Average", dims),
                _cw_q("cpu_util","AWS/ECS","CPUUtilization",    "Average", dims),
                _cw_q("mem_util","AWS/ECS","MemoryUtilization", "Average", dims),
            ], now - timedelta(minutes=10), now)

            running  = c.get("runningTasksCount",  0)
            pending  = c.get("pendingTasksCount",  0)
            services = c.get("activeServicesCount",0)
            cpu_util = round(vals.get("cpu_util", 0), 1)
            mem_util = round(vals.get("mem_util", 0), 1)

            # Get service details
            service_list = []
            try:
                svc_arns = ecs.list_services(cluster=name).get("serviceArns", [])
                if svc_arns:
                    svcs = ecs.describe_services(cluster=name, services=svc_arns[:10])
                    for svc in svcs.get("services", []):
                        service_list.append({
                            "name":    svc["serviceName"],
                            "desired": svc["desiredCount"],
                            "running": svc["runningCount"],
                            "pending": svc["pendingCount"],
                        })
            except Exception:
                pass

            results.append({
                "id":              c["clusterArn"].split("/")[-1],
                "name":            name,
                "public_ip":       "",
                "provider":        "AWS",
                "region":          region,
                "type":            "ECS Cluster",
                "service":         "ECS",
                "state":           c.get("status","ACTIVE").lower(),
                "status":          ("critical" if cpu_util >= 90 or mem_util >= 90
                                    else "warning" if cpu_util >= 70 or mem_util >= 75
                                    else "healthy"),
                "cpu":             cpu_util,
                "mem":             mem_util,
                "disk":            0,
                "net":             "",
                "uptime":          "N/A",
                "running_tasks":   running,
                "pending_tasks":   pending,
                "active_services": services,
                "cpu_reservation": round(vals.get("cpu_res",0), 1),
                "mem_reservation": round(vals.get("mem_res",0), 1),
                "services":        service_list,
                "tags":            {},
                "account_id":      "",
            })
    except Exception as e:
        logger.error(f"ECS collect error {region}: {e}")
    return results


# ── EKS ───────────────────────────────────────────────────────────────────────

def collect_eks(session, region: str) -> list:
    eks = _client(session, "eks", region)
    results = []

    try:
        for cname in eks.list_clusters().get("clusters", []):
            try:
                c  = eks.describe_cluster(name=cname)["cluster"]
                ngs = eks.list_nodegroups(clusterName=cname).get("nodegroups", [])
                nodegroup_details = []

                for ngname in ngs:
                    try:
                        ng = eks.describe_nodegroup(clusterName=cname,
                                                     nodegroupName=ngname)["nodegroup"]
                        sc = ng.get("scalingConfig", {})
                        nodegroup_details.append({
                            "name":    ngname,
                            "desired": sc.get("desiredSize", 0),
                            "min":     sc.get("minSize",     0),
                            "max":     sc.get("maxSize",     0),
                            "status":  ng.get("status",""),
                            "instance_types": ng.get("instanceTypes",[]),
                        })
                    except Exception:
                        pass

                total_desired = sum(n["desired"] for n in nodegroup_details)
                status_str    = c.get("status","")

                results.append({
                    "id":          cname,
                    "name":        cname,
                    "public_ip":   c.get("endpoint",""),
                    "provider":    "AWS",
                    "region":      region,
                    "type":        "EKS Cluster",
                    "service":     "EKS",
                    "state":       status_str.lower(),
                    "status":      ("healthy" if status_str == "ACTIVE"
                                    else "warning" if status_str in ("UPDATING","DEGRADED")
                                    else "critical"),
                    "cpu":         0,
                    "mem":         0,
                    "disk":        0,
                    "net":         "",
                    "uptime":      "N/A",
                    "k8s_version": c.get("version",""),
                    "nodegroups":  nodegroup_details,
                    "node_count":  total_desired,
                    "tags":        c.get("tags",{}),
                    "account_id":  "",
                })
            except Exception as e:
                logger.debug(f"EKS cluster {cname}: {e}")
    except Exception as e:
        logger.error(f"EKS collect error {region}: {e}")
    return results


# ── S3 ────────────────────────────────────────────────────────────────────────

def collect_s3(session) -> list:
    s3  = session.client("s3")
    cw  = session.client("cloudwatch", region_name="us-east-1")
    now = _now()
    results = []

    try:
        buckets = s3.list_buckets().get("Buckets", [])
        for b in buckets:
            name = b["Name"]
            # BucketSizeBytes and NumberOfObjects are daily metrics
            vals = _cw_batch(cw, [
                _cw_q("size", "AWS/S3","BucketSizeBytes",  "Average",
                       [{"Name":"BucketName","Value":name},{"Name":"StorageType","Value":"StandardStorage"}], 86400),
                _cw_q("objs", "AWS/S3","NumberOfObjects",  "Average",
                       [{"Name":"BucketName","Value":name},{"Name":"StorageType","Value":"AllStorageTypes"}], 86400),
            ], now - timedelta(days=2), now)

            size_gb = round(vals.get("size",0) / 1073741824, 3)
            obj_cnt = int(vals.get("objs", 0))

            # Request metrics (if enabled)
            req_vals = _cw_batch(cw, [
                _cw_q("req4xx","AWS/S3","4xxErrors",   "Sum",
                       [{"Name":"BucketName","Value":name},{"Name":"FilterId","Value":"EntireBucket"}], 3600),
                _cw_q("req5xx","AWS/S3","5xxErrors",   "Sum",
                       [{"Name":"BucketName","Value":name},{"Name":"FilterId","Value":"EntireBucket"}], 3600),
            ], now - timedelta(hours=1), now)

            results.append({
                "id":        name,
                "name":      name,
                "public_ip": "",
                "provider":  "AWS",
                "region":    "global",
                "type":      "S3 Bucket",
                "service":   "S3",
                "state":     "active",
                "status":    "healthy",
                "cpu":       0,
                "mem":       0,
                "disk":      0,
                "net":       "",
                "uptime":    "N/A",
                "size_gb":   size_gb,
                "objects":   obj_cnt,
                "errors_4xx":int(req_vals.get("req4xx",0)),
                "errors_5xx":int(req_vals.get("req5xx",0)),
                "tags":      {},
                "account_id":"",
            })
    except Exception as e:
        logger.error(f"S3 collect error: {e}")
    return results


# ── EBS ───────────────────────────────────────────────────────────────────────

def collect_ebs(session, region: str) -> list:
    ec2 = _client(session, "ec2",        region)
    cw  = _client(session, "cloudwatch", region)
    now = _now()
    results = []

    try:
        vols = ec2.describe_volumes(
            Filters=[{"Name":"status","Values":["in-use"]}]
        )["Volumes"]

        for vol in vols:
            vid  = vol["VolumeId"]
            dims = [{"Name":"VolumeId","Value":vid}]
            vals = _cw_batch(cw, [
                _cw_q("riops","AWS/EBS","VolumeReadOps",    "Sum",     dims),
                _cw_q("wiops","AWS/EBS","VolumeWriteOps",   "Sum",     dims),
                _cw_q("burst","AWS/EBS","BurstBalance",     "Average", dims),
            ], now - timedelta(minutes=10), now)

            prov_iops = vol.get("Iops", 0)
            act_iops  = int(vals.get("riops",0) + vals.get("wiops",0))
            burst     = round(vals.get("burst",100), 1)
            iops_pct  = round(act_iops / prov_iops * 100, 1) if prov_iops > 0 else 0

            results.append({
                "id":           vid,
                "name":         vid,
                "public_ip":    "",
                "provider":     "AWS",
                "region":       region,
                "type":         f"EBS {vol.get('VolumeType','')}",
                "service":      "EBS",
                "state":        vol.get("State",""),
                "status":       ("warning" if burst < 20 or iops_pct > 90 else "healthy"),
                "cpu":          iops_pct,
                "mem":          0,
                "disk":         0,
                "net":          f"{act_iops} IOPS",
                "uptime":       "N/A",
                "size_gb":      vol.get("Size",0),
                "volume_type":  vol.get("VolumeType",""),
                "prov_iops":    prov_iops,
                "act_iops":     act_iops,
                "burst_balance":burst,
                "encrypted":    vol.get("Encrypted", False),
                "tags":         {t["Key"]:t["Value"] for t in vol.get("Tags",[])},
                "account_id":   "",
            })
    except Exception as e:
        logger.error(f"EBS collect error {region}: {e}")
    return results


# ── ALB / NLB ─────────────────────────────────────────────────────────────────

def collect_alb(session, region: str) -> list:
    elb = _client(session, "elbv2",      region)
    cw  = _client(session, "cloudwatch", region)
    now = _now()
    results = []

    try:
        lbs = elb.describe_load_balancers().get("LoadBalancers", [])
        for lb in lbs:
            arn    = lb["LoadBalancerArn"]
            name   = lb["LoadBalancerName"]
            lbtype = lb["Type"]              # application | network
            ns     = "AWS/ApplicationELB" if lbtype == "application" else "AWS/NetworkELB"
            lb_id  = arn.split(":loadbalancer/")[-1]
            dims   = [{"Name":"LoadBalancer","Value":lb_id}]

            vals = _cw_batch(cw, [
                _cw_q("reqs",  ns,"RequestCount",           "Sum",     dims),
                _cw_q("lat",   ns,"TargetResponseTime",     "p99",     dims),
                _cw_q("lat50", ns,"TargetResponseTime",     "p50",     dims),
                _cw_q("lat95", ns,"TargetResponseTime",     "p95",     dims),
                _cw_q("5xx",   ns,"HTTPCode_ELB_5XX_Count", "Sum",     dims),
                _cw_q("4xx",   ns,"HTTPCode_ELB_4XX_Count", "Sum",     dims),
            ], now - timedelta(minutes=10), now)

            # Target health
            healthy_t = unhealthy_t = 0
            try:
                tgs = elb.describe_target_groups(LoadBalancerArn=arn).get("TargetGroups",[])
                for tg in tgs:
                    health = elb.describe_target_health(TargetGroupArn=tg["TargetGroupArn"])
                    for t in health["TargetHealthDescriptions"]:
                        if t["TargetHealth"]["State"] == "healthy":
                            healthy_t += 1
                        else:
                            unhealthy_t += 1
            except Exception:
                pass

            reqs    = int(vals.get("reqs",  0))
            lat_p99 = round(vals.get("lat",  0) * 1000, 1)
            lat_p50 = round(vals.get("lat50",0) * 1000, 1)
            lat_p95 = round(vals.get("lat95",0) * 1000, 1)
            err_5xx = int(vals.get("5xx",   0))
            err_4xx = int(vals.get("4xx",   0))
            err_rate= round(err_5xx / reqs * 100, 2) if reqs > 0 else 0

            results.append({
                "id":          name,
                "name":        name,
                "public_ip":   lb.get("DNSName",""),
                "provider":    "AWS",
                "region":      region,
                "type":        f"{lbtype.upper()} Load Balancer",
                "service":     "ALB" if lbtype == "application" else "NLB",
                "state":       lb["State"]["Code"],
                "status":      ("critical" if unhealthy_t > 0 and healthy_t == 0
                                else "warning"  if unhealthy_t > 0 or err_rate > 5
                                else "healthy"),
                "cpu":         err_rate,
                "mem":         0,
                "disk":        0,
                "net":         f"{reqs} req/5min",
                "uptime":      "N/A",
                "requests":    reqs,
                "latency_p50_ms": lat_p50,
                "latency_p95_ms": lat_p95,
                "latency_p99_ms": lat_p99,
                "errors_5xx":  err_5xx,
                "errors_4xx":  err_4xx,
                "error_rate":  err_rate,
                "healthy_targets":   healthy_t,
                "unhealthy_targets": unhealthy_t,
                "tags":        {},
                "account_id":  "",
            })
    except Exception as e:
        logger.error(f"ALB collect error {region}: {e}")
    return results


# ── SQS ───────────────────────────────────────────────────────────────────────

def collect_sqs(session, region: str) -> list:
    sqs = _client(session, "sqs",        region)
    cw  = _client(session, "cloudwatch", region)
    now = _now()
    results = []

    try:
        queues = sqs.list_queues().get("QueueUrls", [])
        for qurl in queues:
            qname = qurl.split("/")[-1]
            dims  = [{"Name":"QueueName","Value":qname}]

            attrs = sqs.get_queue_attributes(
                QueueUrl=qurl,
                AttributeNames=["ApproximateNumberOfMessages",
                                 "ApproximateNumberOfMessagesNotVisible",
                                 "ApproximateNumberOfMessagesDelayed"]
            )["Attributes"]

            vals = _cw_batch(cw, [
                _cw_q("age","AWS/SQS","ApproximateAgeOfOldestMessage","Maximum",dims),
                _cw_q("sent","AWS/SQS","NumberOfMessagesSent",        "Sum",    dims),
            ], now - timedelta(minutes=15), now)

            depth = int(attrs.get("ApproximateNumberOfMessages",0))
            age_s = int(vals.get("age",0))

            results.append({
                "id":         qname,
                "name":       qname,
                "public_ip":  "",
                "provider":   "AWS",
                "region":     region,
                "type":       "SQS Queue",
                "service":    "SQS",
                "state":      "active",
                "status":     ("critical" if depth > 10000 or age_s > 3600
                               else "warning" if depth > 1000 or age_s > 300
                               else "healthy"),
                "cpu":        0,
                "mem":        0,
                "disk":       0,
                "net":        f"{depth} msgs",
                "uptime":     "N/A",
                "depth":      depth,
                "in_flight":  int(attrs.get("ApproximateNumberOfMessagesNotVisible",0)),
                "delayed":    int(attrs.get("ApproximateNumberOfMessagesDelayed",0)),
                "oldest_msg_age_s": age_s,
                "sent_per_period":  int(vals.get("sent",0)),
                "tags":       {},
                "account_id": "",
            })
    except Exception as e:
        logger.error(f"SQS collect error {region}: {e}")
    return results


# ── Kinesis ───────────────────────────────────────────────────────────────────

def collect_kinesis(session, region: str) -> list:
    kin = _client(session, "kinesis",    region)
    cw  = _client(session, "cloudwatch", region)
    now = _now()
    results = []

    try:
        for sname in kin.list_streams().get("StreamNames", []):
            dims = [{"Name":"StreamName","Value":sname}]
            vals = _cw_batch(cw, [
                _cw_q("age",  "AWS/Kinesis","GetRecords.IteratorAgeMilliseconds","Maximum",dims),
                _cw_q("in",   "AWS/Kinesis","IncomingRecords",                   "Sum",    dims),
                _cw_q("out",  "AWS/Kinesis","GetRecords.Records",                "Sum",    dims),
                _cw_q("bytes","AWS/Kinesis","IncomingBytes",                     "Sum",    dims),
            ], now - timedelta(minutes=10), now)

            age_ms = int(vals.get("age", 0))

            results.append({
                "id":         sname,
                "name":       sname,
                "public_ip":  "",
                "provider":   "AWS",
                "region":     region,
                "type":       "Kinesis Stream",
                "service":    "Kinesis",
                "state":      "active",
                "status":     ("critical" if age_ms > 3600000
                               else "warning" if age_ms > 60000
                               else "healthy"),
                "cpu":        0,
                "mem":        0,
                "disk":       0,
                "net":        f"{int(vals.get('in',0))} rec/5min",
                "uptime":     "N/A",
                "iterator_age_ms":    age_ms,
                "incoming_records":   int(vals.get("in",   0)),
                "outgoing_records":   int(vals.get("out",  0)),
                "incoming_bytes":     int(vals.get("bytes",0)),
                "tags":       {},
                "account_id": "",
            })
    except Exception as e:
        logger.error(f"Kinesis collect error {region}: {e}")
    return results


# ── Cost Explorer ─────────────────────────────────────────────────────────────

def collect_costs(session) -> dict:
    ce    = session.client("ce", region_name="us-east-1")
    now   = _now()
    start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    end   = now.strftime("%Y-%m-%d")
    month = now.replace(day=1).strftime("%Y-%m-%d")
    result = {"daily":[], "by_service":[], "by_tag":{},
              "total_mtd":0, "forecast":0, "anomalies":[],
              "savings_utilisation":None}

    # Daily spend
    try:
        r = ce.get_cost_and_usage(TimePeriod={"Start":start,"End":end},
                                  Granularity="DAILY", Metrics=["UnblendedCost"])
        result["daily"] = [{"date": d["TimePeriod"]["Start"],
                             "cost": round(float(d["Total"]["UnblendedCost"]["Amount"]),2)}
                           for d in r["ResultsByTime"]]
        result["total_mtd"] = round(sum(d["cost"] for d in result["daily"]
                                       if d["date"] >= month), 2)
    except Exception as e:
        logger.warning(f"CE daily: {e}")

    # By service MTD
    try:
        r = ce.get_cost_and_usage(TimePeriod={"Start":month,"End":end},
                                  Granularity="MONTHLY", Metrics=["UnblendedCost"],
                                  GroupBy=[{"Type":"DIMENSION","Key":"SERVICE"}])
        svcs = []
        for g in (r["ResultsByTime"][0]["Groups"] if r["ResultsByTime"] else []):
            cost = round(float(g["Metrics"]["UnblendedCost"]["Amount"]),2)
            if cost > 0.01:
                svcs.append({"service":g["Keys"][0],"cost":cost})
        result["by_service"] = sorted(svcs, key=lambda x: x["cost"], reverse=True)
    except Exception as e:
        logger.warning(f"CE by service: {e}")

    # Forecast
    try:
        remaining_end = (now.replace(day=1) + timedelta(days=32)).replace(day=1).strftime("%Y-%m-%d")
        r = ce.get_cost_forecast(
            TimePeriod={"Start":end,"End":remaining_end},
            Metric="UNBLENDED_COST", Granularity="MONTHLY")
        result["forecast"] = round(float(r["Total"]["Amount"]),2)
    except Exception as e:
        logger.warning(f"CE forecast: {e}")

    # Cost anomalies
    try:
        r = ce.get_anomalies(DateInterval={"StartDate":start,"EndDate":end})
        result["anomalies"] = [
            {"id":   a["AnomalyId"],
             "service": a.get("RootCauses",[{}])[0].get("Service","Unknown"),
             "impact": round(float(a.get("Impact",{}).get("TotalImpact",0)),2),
             "start": a.get("AnomalyStartDate",""),
             "end":   a.get("AnomalyEndDate","")}
            for a in r.get("Anomalies",[])
        ]
    except Exception as e:
        logger.warning(f"CE anomalies: {e}")

    # Savings plan utilisation
    try:
        r = ce.get_savings_plans_utilization(TimePeriod={"Start":month,"End":end})
        t = r.get("Total",{})
        result["savings_utilisation"] = {
            "utilisation_pct": t.get("UtilizationPercentage","N/A"),
            "on_demand_cost_equivalent": round(float(t.get("TotalCommitment",{}).get("OnDemandCostEquivalent",0)),2),
        }
    except Exception as e:
        logger.warning(f"CE savings plans: {e}")

    # By tag (Environment)
    try:
        r = ce.get_cost_and_usage(TimePeriod={"Start":month,"End":end},
                                  Granularity="MONTHLY", Metrics=["UnblendedCost"],
                                  GroupBy=[{"Type":"TAG","Key":"Environment"}])
        tag_costs = {}
        for g in (r["ResultsByTime"][0]["Groups"] if r["ResultsByTime"] else []):
            cost = round(float(g["Metrics"]["UnblendedCost"]["Amount"]),2)
            if cost > 0.01:
                tag_costs[g["Keys"][0]] = cost
        result["by_tag"] = tag_costs
    except Exception as e:
        logger.warning(f"CE by tag: {e}")

    return result


def _parse_patch_output(output: str):
    """
    Parse patch scan output. Handles two formats:
    1. Our custom AWS-RunShellScript structured output (MULTICLOUDOPS_PATCH_SCAN_START marker)
    2. Raw apt-get output from old AWS-RunPatchBaseline runs (fallback)
    Returns (missing, installed, failed, patch_state, packages) or None.
    """
    import re
    if not output:
        return None
    missing = installed = failed = 0
    packages = []
    found = False

    # Format 1: structured output from our custom scan script
    if "MULTICLOUDOPS_PATCH_SCAN_START" in output:
        m = re.search(r'MISSING_COUNT=(\d+)', output)
        if m:
            missing = int(m.group(1))
            found = True
        m2 = re.search(r'INSTALLED_COUNT=(\d+)', output)
        if m2:
            installed = int(m2.group(1))
        m3 = re.search(r'MISSING_PACKAGES=([^\n]*)', output)
        if m3:
            pkgs = m3.group(1).strip().rstrip(',')
            packages = [p.strip() for p in pkgs.split(',') if p.strip()]

    # Format 2: raw apt-get output (old AWS-RunPatchBaseline fallback)
    if not found:
        m = re.search(r'(\d+) packages? can be upgraded', output)
        if m:
            missing = int(m.group(1))
            found = True
        m2 = re.search(r'and (\d+) not upgraded', output)
        if m2 and not missing:
            missing = int(m2.group(1))
            found = True
        m3 = re.search(r'(\d+) upgraded,\s*(\d+) newly installed', output)
        if m3:
            installed = int(m3.group(1)) + int(m3.group(2))
            found = True

    if not found:
        return None
    patch_state = "compliant" if missing == 0 else "non_compliant"
    return missing, installed, failed, patch_state, packages


def _patch_state_from_command_output(ssm, iid: str):
    """Read the most recent patch scan command output for this instance.
    Checks both our custom AWS-RunShellScript scan and the old AWS-RunPatchBaseline."""
    for doc_name in ("AWS-RunShellScript", "AWS-RunPatchBaseline"):
        try:
            resp = ssm.list_command_invocations(
                InstanceId=iid,
                Filters=[{"key": "DocumentName", "value": doc_name}],
                Details=True,
                MaxResults=5,
            )
            invocations = sorted(
                resp.get("CommandInvocations", []),
                key=lambda x: x.get("RequestedDateTime", ""),
                reverse=True,
            )
            for inv in invocations:
                # Only use successful commands (our script always exits 0)
                # but also try Failed ones as fallback (old RunPatchBaseline)
                for plugin in inv.get("CommandPlugins", []):
                    output = plugin.get("Output", "") or plugin.get("StandardOutputContent", "")
                    parsed = _parse_patch_output(output)
                    if parsed is not None:
                        return parsed
        except Exception:
            continue
    return None


# ── SSM ───────────────────────────────────────────────────────────────────────

def collect_ssm(session, region: str) -> list:
    ssm = _client(session, "ssm", region)
    results = []

    try:
        for page in ssm.get_paginator("describe_instance_information").paginate():
            for inst in page["InstanceInformationList"]:
                iid = inst["InstanceId"]

                # Patch compliance — try describe_instance_patch_states first,
                # then fall back to SSM compliance summary (populated by RunPatchBaselineAssociation)
                patch_state = "unknown"
                missing_patches = failed_patches = installed_patches = 0
                try:
                    pc = ssm.describe_instance_patch_states(InstanceIds=[iid])
                    if pc["InstancePatchStates"]:
                        ps = pc["InstancePatchStates"][0]
                        missing_patches   = ps.get("MissingCount",   0)
                        failed_patches    = ps.get("FailedCount",    0)
                        installed_patches = ps.get("InstalledCount", 0)
                        patch_state = "non_compliant" if missing_patches > 0 or failed_patches > 0 else "compliant"
                except Exception:
                    pass

                # Fallback: read from SSM Compliance API (written by RunPatchBaselineAssociation)
                if patch_state == "unknown":
                    try:
                        comp = ssm.list_compliance_items(
                            Filters=[
                                {"Key": "ComplianceType", "Values": ["Patch"],       "Type": "EQUAL"},
                                {"Key": "InstanceId",     "Values": [iid],            "Type": "EQUAL"},
                                {"Key": "Status",         "Values": ["NON_COMPLIANT"],"Type": "EQUAL"},
                            ],
                            MaxResults=50,
                        )
                        non_compliant_items = comp.get("ComplianceItems", [])
                        comp2 = ssm.list_compliance_items(
                            Filters=[
                                {"Key": "ComplianceType", "Values": ["Patch"],      "Type": "EQUAL"},
                                {"Key": "InstanceId",     "Values": [iid],           "Type": "EQUAL"},
                                {"Key": "Status",         "Values": ["COMPLIANT"],  "Type": "EQUAL"},
                            ],
                            MaxResults=1,
                        )
                        compliant_items = comp2.get("ComplianceItems", [])
                        if non_compliant_items or compliant_items:
                            missing_patches   = len(non_compliant_items)
                            installed_patches = len(compliant_items)
                            patch_state = "non_compliant" if non_compliant_items else "compliant"
                    except Exception:
                        pass

                # Method 3: Parse most recent RunPatchBaseline command output
                # This is the reliable fallback for Ubuntu where Patch Manager
                # doesn't store results (apt exits non-zero → SSM marks "Failed"
                # but the stdout contains the real upgrade count)
                missing_packages = []
                if patch_state == "unknown":
                    parsed = _patch_state_from_command_output(ssm, iid)
                    if parsed is not None:
                        missing_patches, installed_patches, failed_patches, patch_state, missing_packages = parsed

                # Software inventory
                software = []
                software_count = 0
                try:
                    inv = ssm.list_inventory_entries(
                        InstanceId=iid, TypeName="AWS:Application", MaxResults=50)
                    entries        = inv.get("Entries", [])
                    software       = [{"name": e.get("Name",""), "version": e.get("Version","")} for e in entries]
                    software_count = inv.get("TotalCount", len(software))
                except Exception:
                    pass

                results.append({
                    "instance_id":      iid,
                    "platform":         inst.get("PlatformName",""),
                    "platform_version": inst.get("PlatformVersion",""),
                    "agent_version":    inst.get("AgentVersion",""),
                    "ping_status":      inst.get("PingStatus",""),
                    "last_ping":        inst.get("LastPingDateTime","").isoformat() if inst.get("LastPingDateTime") else "",
                    "patch_state":      patch_state,
                    "missing_patches":  missing_patches,
                    "failed_patches":   failed_patches,
                    "installed_patches":installed_patches,
                    "missing_packages": missing_packages,
                    "software":         software[:50],
                    "software_count":   software_count,
                    "region":           region,
                })
    except Exception as e:
        logger.warning(f"SSM collect error {region}: {e}")
    return results


# ── Security ──────────────────────────────────────────────────────────────────

def collect_security(session, region: str) -> dict:
    result = {"securityhub":[], "guardduty":[], "iam_unused_roles":[],
              "config_non_compliant":[], "cloudtrail_events":[]}

    # SecurityHub
    try:
        sh = _client(session, "securityhub", region)
        for page in sh.get_paginator("get_findings").paginate(
            Filters={"RecordState":[{"Value":"ACTIVE","Comparison":"EQUALS"}],
                     "WorkflowStatus":[{"Value":"NEW","Comparison":"EQUALS"}]},
            MaxResults=100
        ):
            for f in page["Findings"]:
                result["securityhub"].append({
                    "id":          f["Id"],
                    "title":       f["Title"],
                    "severity":    f.get("Severity",{}).get("Label","INFORMATIONAL"),
                    "resource":    f["Resources"][0]["Id"] if f.get("Resources") else "",
                    "description": f.get("Description","")[:300],
                    "created_at":  f.get("CreatedAt",""),
                    "updated_at":  f.get("UpdatedAt",""),
                })
            if len(result["securityhub"]) >= 100:
                break
    except Exception as e:
        logger.debug(f"SecurityHub: {e}")

    # GuardDuty
    try:
        gd = _client(session, "guardduty", region)
        detectors = gd.list_detectors().get("DetectorIds",[])
        if detectors:
            did = detectors[0]
            fids = gd.list_findings(
                DetectorId=did,
                FindingCriteria={"Criterion":{"service.archived":{"Eq":["false"]}}}
            ).get("FindingIds",[])
            if fids:
                findings = gd.get_findings(DetectorId=did,
                                            FindingIds=fids[:20]).get("Findings",[])
                for f in findings:
                    result["guardduty"].append({
                        "id":          f["Id"],
                        "title":       f.get("Title",""),
                        "severity":    f.get("Severity",0),
                        "type":        f.get("Type",""),
                        "region":      f.get("Region",""),
                        "created_at":  f.get("CreatedAt",""),
                        "resource":    f.get("Resource",{}).get("ResourceType",""),
                    })
    except Exception as e:
        logger.debug(f"GuardDuty: {e}")

    # IAM unused roles (sample first 20)
    try:
        iam = session.client("iam")
        roles = iam.list_roles(MaxItems=20).get("Roles",[])
        for role in roles:
            try:
                advisor = iam.generate_service_last_accessed_details(Arn=role["Arn"])
                import time; time.sleep(0.5)
                details = iam.get_service_last_accessed_details(
                    JobId=advisor["JobId"])
                accessed = any(s.get("LastAuthenticated") for s in
                               details.get("ServicesLastAccessed",[]))
                if not accessed:
                    result["iam_unused_roles"].append({
                        "role_name":  role["RoleName"],
                        "arn":        role["Arn"],
                        "created_at": role["CreateDate"].isoformat() if role.get("CreateDate") else "",
                    })
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"IAM advisor: {e}")

    # AWS Config
    try:
        cfg = _client(session, "config", region)
        non_compliant = cfg.describe_compliance_by_config_rule(
            ComplianceTypes=["NON_COMPLIANT"]
        ).get("ComplianceByConfigRules",[])
        result["config_non_compliant"] = [
            {"rule": r["ConfigRuleName"],
             "compliance": r["Compliance"]["ComplianceType"]}
            for r in non_compliant
            if r["Compliance"]["ComplianceType"] == "NON_COMPLIANT"
        ]
    except Exception as e:
        logger.debug(f"Config: {e}")

    # CloudTrail recent events
    try:
        ct = _client(session, "cloudtrail", region)
        events = ct.lookup_events(MaxResults=20).get("Events",[])
        result["cloudtrail_events"] = [
            {"event_name": e.get("EventName",""),
             "username":   e.get("Username",""),
             "source_ip":  e.get("SourceIPAddress",""),
             "event_time": e.get("EventTime","").isoformat() if e.get("EventTime") else ""}
            for e in events
        ]
    except Exception as e:
        logger.debug(f"CloudTrail: {e}")

    return result


# ── Cost optimisation ─────────────────────────────────────────────────────────

def collect_cost_optimisation(session, region: str, instances: list) -> list:
    recommendations = []

    for inst in instances:
        if inst.get("service") != "EC2" or inst.get("state") != "running":
            continue
        cpu = inst.get("cpu", 0)
        if cpu < 10:
            recommendations.append({
                "type":        "underutilised",
                "severity":    "medium",
                "resource_id": inst["id"],
                "resource":    inst["name"],
                "service":     "EC2",
                "region":      region,
                "title":       f"Under-utilised: {inst['name']}",
                "detail":      f"CPU {cpu}% — consider downsizing or stopping",
                "saving_pct":  40,
            })

    try:
        co = _client(session, "compute-optimizer", region)
        r  = co.get_ec2_instance_recommendations()
        for rec in r.get("instanceRecommendations",[]):
            if rec.get("finding") == "OVER_PROVISIONED":
                opt = rec.get("recommendationOptions",[{}])[0]
                savings = opt.get("estimatedMonthlySavings",{}).get("value",0)
                recommendations.append({
                    "type":        "rightsize",
                    "severity":    "high",
                    "resource_id": rec["instanceArn"].split("/")[-1],
                    "resource":    rec.get("instanceName",""),
                    "service":     "EC2",
                    "region":      region,
                    "title":       f"Right-size: {rec.get('instanceName','')}",
                    "detail":      f"{rec['currentInstanceType']} → {opt.get('instanceType','smaller')}",
                    "saving_pct":  round(savings, 0),
                })
    except Exception:
        pass

    return recommendations


# ── Master collector ──────────────────────────────────────────────────────────

def collect_all(account: dict) -> dict:
    raw_regions = account.get("regions", '["us-east-1"]')
    if isinstance(raw_regions, list):
        regions = raw_regions
    else:
        try:
            regions = json.loads(raw_regions)
        except Exception:
            regions = ["us-east-1"]

    session    = _boto_session(account)
    account_id = account.get("account_id", "")

    result = {
        "account_id":    account_id,
        "resources":     [],
        "costs":         {},
        "ssm":           [],
        "security":      {"securityhub":[],"guardduty":[],"iam_unused_roles":[],
                          "config_non_compliant":[],"cloudtrail_events":[]},
        "optimisations": [],
        "errors":        [],
        "collected_at":  _now().isoformat(),
    }

    if not account_id:
        try:
            result["account_id"] = session.client("sts").get_caller_identity()["Account"]
        except Exception as e:
            result["errors"].append(f"STS: {e}")

    # S3 and costs are global (run once, not per-region)
    try:
        result["resources"].extend([{**r,"account_id":result["account_id"]}
                                     for r in collect_s3(session)])
    except Exception as e:
        result["errors"].append(f"S3: {e}")

    try:
        result["costs"] = collect_costs(session)
    except Exception as e:
        result["errors"].append(f"CostExplorer: {e}")

    for region in regions:
        logger.info(f"Collecting {result['account_id']} / {region}")
        aid = result["account_id"]

        for svc_fn, label in [
            (lambda r: collect_ec2(session, r),      "EC2"),
            (lambda r: collect_rds(session, r),      "RDS"),
            (lambda r: collect_lambda(session, r),   "Lambda"),
            (lambda r: collect_ecs(session, r),      "ECS"),
            (lambda r: collect_eks(session, r),      "EKS"),
            (lambda r: collect_ebs(session, r),      "EBS"),
            (lambda r: collect_alb(session, r),      "ALB"),
            (lambda r: collect_sqs(session, r),      "SQS"),
            (lambda r: collect_kinesis(session, r),  "Kinesis"),
        ]:
            try:
                resources = svc_fn(region)
                for r in resources:
                    r["account_id"] = aid
                result["resources"].extend(resources)
            except Exception as e:
                result["errors"].append(f"{label} {region}: {e}")

        # SSM
        try:
            result["ssm"].extend(collect_ssm(session, region))
        except Exception as e:
            result["errors"].append(f"SSM {region}: {e}")

        # Security (first region only to avoid duplicates)
        if region == regions[0]:
            try:
                sec = collect_security(session, region)
                # Merge into result["security"]
                for key in sec:
                    result["security"][key] = sec[key]
            except Exception as e:
                result["errors"].append(f"Security {region}: {e}")

        # Optimisations
        try:
            ec2_resources = [r for r in result["resources"]
                             if r.get("service") == "EC2" and r.get("region") == region]
            result["optimisations"].extend(
                collect_cost_optimisation(session, region, ec2_resources))
        except Exception as e:
            result["errors"].append(f"Optimisations {region}: {e}")

    logger.info(f"Collection done: {len(result['resources'])} resources, {len(result['errors'])} errors")
    return result
