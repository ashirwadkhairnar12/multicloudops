import random
import math
from datetime import datetime

# Full server dataset (28 servers across 6 providers)
SERVERS = [
    # AWS
    {"id": "s001", "name": "web-prod-01", "provider": "AWS", "region": "us-east-1", "type": "EC2", "status": "healthy", "cpu": 32.0, "mem": 61.0, "disk": 43, "net": "245 Mbps", "uptime": "99.98%"},
    {"id": "s002", "name": "api-server-03", "provider": "AWS", "region": "us-west-2", "type": "EC2", "status": "critical", "cpu": 94.0, "mem": 88.0, "disk": 72, "net": "1.2 Gbps", "uptime": "98.12%"},
    {"id": "s003", "name": "db-primary-01", "provider": "AWS", "region": "us-east-1", "type": "RDS", "status": "warning", "cpu": 68.0, "mem": 79.0, "disk": 81, "net": "890 Mbps", "uptime": "99.91%"},
    {"id": "s004", "name": "cache-node-02", "provider": "AWS", "region": "eu-west-1", "type": "ElastiCache", "status": "healthy", "cpu": 24.0, "mem": 45.0, "disk": 30, "net": "340 Mbps", "uptime": "100%"},
    {"id": "s005", "name": "worker-batch-05", "provider": "AWS", "region": "ap-southeast-1", "type": "EC2", "status": "fluctuating", "cpu": 55.0, "mem": 62.0, "disk": 44, "net": "600 Mbps", "uptime": "99.5%"},
    {"id": "s006", "name": "lambda-edge-01", "provider": "AWS", "region": "us-east-1", "type": "Lambda", "status": "healthy", "cpu": 12.0, "mem": 28.0, "disk": 5, "net": "120 Mbps", "uptime": "100%"},
    {"id": "s007", "name": "eks-node-04", "provider": "AWS", "region": "us-west-2", "type": "EKS", "status": "healthy", "cpu": 41.0, "mem": 53.0, "disk": 39, "net": "780 Mbps", "uptime": "99.99%"},
    {"id": "s008", "name": "mq-broker-01", "provider": "AWS", "region": "eu-central-1", "type": "MQ", "status": "stopped", "cpu": 0.0, "mem": 0.0, "disk": 60, "net": "0 Mbps", "uptime": "0%"},
    # Azure
    {"id": "s009", "name": "vm-frontend-02", "provider": "Azure", "region": "eastus", "type": "VM", "status": "healthy", "cpu": 28.0, "mem": 44.0, "disk": 35, "net": "310 Mbps", "uptime": "99.97%"},
    {"id": "s010", "name": "sql-db-prod", "provider": "Azure", "region": "westeurope", "type": "SQL DB", "status": "warning", "cpu": 71.0, "mem": 83.0, "disk": 78, "net": "560 Mbps", "uptime": "99.88%"},
    {"id": "s011", "name": "aks-cluster-01", "provider": "Azure", "region": "eastus2", "type": "AKS", "status": "healthy", "cpu": 38.0, "mem": 55.0, "disk": 42, "net": "920 Mbps", "uptime": "99.95%"},
    {"id": "s012", "name": "func-payments-01", "provider": "Azure", "region": "northeurope", "type": "Functions", "status": "critical", "cpu": 97.0, "mem": 91.0, "disk": 55, "net": "2.1 Gbps", "uptime": "97.3%"},
    {"id": "s013", "name": "cdn-edge-eu", "provider": "Azure", "region": "westeurope", "type": "CDN", "status": "healthy", "cpu": 15.0, "mem": 22.0, "disk": 18, "net": "4.5 Gbps", "uptime": "100%"},
    # GCP
    {"id": "s014", "name": "gce-api-prod-01", "provider": "GCP", "region": "us-central1", "type": "GCE", "status": "healthy", "cpu": 35.0, "mem": 48.0, "disk": 40, "net": "670 Mbps", "uptime": "99.96%"},
    {"id": "s015", "name": "gke-cluster-1", "provider": "GCP", "region": "us-east1", "type": "GKE", "status": "fluctuating", "cpu": 62.0, "mem": 70.0, "disk": 55, "net": "1.1 Gbps", "uptime": "99.4%"},
    {"id": "s016", "name": "cloudsql-main", "provider": "GCP", "region": "europe-west1", "type": "Cloud SQL", "status": "healthy", "cpu": 44.0, "mem": 58.0, "disk": 67, "net": "430 Mbps", "uptime": "99.99%"},
    {"id": "s017", "name": "bigquery-node", "provider": "GCP", "region": "us-central1", "type": "BigQuery", "status": "healthy", "cpu": 22.0, "mem": 31.0, "disk": 88, "net": "2.3 Gbps", "uptime": "100%"},
    # Oracle
    {"id": "s018", "name": "oci-db-prod-01", "provider": "Oracle", "region": "us-ashburn-1", "type": "DB System", "status": "healthy", "cpu": 47.0, "mem": 64.0, "disk": 72, "net": "780 Mbps", "uptime": "99.98%"},
    {"id": "s019", "name": "oci-vm-app-02", "provider": "Oracle", "region": "eu-frankfurt-1", "type": "Compute", "status": "warning", "cpu": 76.0, "mem": 81.0, "disk": 59, "net": "440 Mbps", "uptime": "99.7%"},
    {"id": "s020", "name": "oci-lb-prod", "provider": "Oracle", "region": "us-ashburn-1", "type": "Load Balancer", "status": "healthy", "cpu": 18.0, "mem": 25.0, "disk": 12, "net": "3.2 Gbps", "uptime": "100%"},
    # Kubernetes
    {"id": "s021", "name": "k8s-master-01", "provider": "Kubernetes", "region": "dc-east", "type": "Control Plane", "status": "healthy", "cpu": 29.0, "mem": 46.0, "disk": 38, "net": "560 Mbps", "uptime": "99.99%"},
    {"id": "s022", "name": "k8s-worker-03", "provider": "Kubernetes", "region": "dc-east", "type": "Worker Node", "status": "critical", "cpu": 96.0, "mem": 94.0, "disk": 82, "net": "1.8 Gbps", "uptime": "98.9%"},
    {"id": "s023", "name": "k8s-worker-04", "provider": "Kubernetes", "region": "dc-west", "type": "Worker Node", "status": "healthy", "cpu": 41.0, "mem": 55.0, "disk": 44, "net": "720 Mbps", "uptime": "99.98%"},
    {"id": "s024", "name": "ingress-nginx-01", "provider": "Kubernetes", "region": "dc-east", "type": "Ingress", "status": "healthy", "cpu": 14.0, "mem": 20.0, "disk": 8, "net": "5.1 Gbps", "uptime": "100%"},
    # On-Prem
    {"id": "s025", "name": "bare-metal-db-01", "provider": "On-Prem", "region": "DC-Mumbai", "type": "Physical", "status": "healthy", "cpu": 52.0, "mem": 68.0, "disk": 75, "net": "1 Gbps", "uptime": "99.95%"},
    {"id": "s026", "name": "vmware-esxi-02", "provider": "On-Prem", "region": "DC-Mumbai", "type": "VMware", "status": "warning", "cpu": 78.0, "mem": 85.0, "disk": 88, "net": "800 Mbps", "uptime": "99.6%"},
    {"id": "s027", "name": "nas-storage-01", "provider": "On-Prem", "region": "DC-London", "type": "NAS", "status": "healthy", "cpu": 8.0, "mem": 14.0, "disk": 92, "net": "2 Gbps", "uptime": "100%"},
    {"id": "s028", "name": "firewall-edge-01", "provider": "On-Prem", "region": "DC-Mumbai", "type": "Network", "status": "fluctuating", "cpu": 44.0, "mem": 38.0, "disk": 20, "net": "10 Gbps", "uptime": "99.8%"},
]

ALERTS = [
    {"id": "a001", "severity": "critical", "title": "High CPU Usage", "resource": "i-0rft3c3mfd (AWS)", "source": "CloudWatch", "time": "10:35 AM", "status": "New"},
    {"id": "a002", "severity": "warning", "title": "Disk Space Low", "resource": "vm-prod-01 (Azure)", "source": "Azure Monitor", "time": "10:28 AM", "status": "New"},
    {"id": "a003", "severity": "critical", "title": "Memory Usage Fluctuating", "resource": "gke-cluster-1 (GCP)", "source": "Cloud Monitoring", "time": "10:34 AM", "status": "In-Progress"},
    {"id": "a004", "severity": "warning", "title": "Pod CrashLoopBackOff", "resource": "api-server (K8s)", "source": "Prometheus", "time": "10:22 AM", "status": "In-Progress"},
    {"id": "a005", "severity": "critical", "title": "High Network Latency", "resource": "dc-2-server-15 (On-Prem)", "source": "Zabbix", "time": "10:22 AM", "status": "In-Progress"},
    {"id": "a006", "severity": "critical", "title": "Database Connections High", "resource": "db-primary-01 (AWS)", "source": "CloudWatch", "time": "10:18 AM", "status": "In-Progress"},
    {"id": "a007", "severity": "warning", "title": "Service Down", "resource": "payment-service (K8s)", "source": "Prometheus", "time": "10:18 AM", "status": "New"},
    {"id": "a008", "severity": "warning", "title": "SSL Certificate Expiring", "resource": "api-server-01 (AWS)", "source": "CloudWatch", "time": "10:15 AM", "status": "Acknowledged"},
]

INCIDENTS = [
    {"id": "INC-1005", "title": "Database Connection Failure", "severity": "critical", "status": "Resolved", "impact": "High", "created": "May 24, 10:24 AM", "updated": "May 24, 11:02 AM", "mttr": "38m"},
    {"id": "INC-1004", "title": "API Service Degradation", "severity": "high", "status": "Resolved", "impact": "High", "created": "May 24, 08:18 AM", "updated": "May 24, 08:45 AM", "mttr": "27m"},
    {"id": "INC-1003", "title": "High Memory Usage", "severity": "medium", "status": "Resolved", "impact": "Medium", "created": "May 23, 08:02 AM", "updated": "May 23, 08:20 AM", "mttr": "18m"},
    {"id": "INC-1002", "title": "Network Outage", "severity": "critical", "status": "Closed", "impact": "High", "created": "May 23, 02:17 AM", "updated": "May 23, 03:45 AM", "mttr": "88m"},
    {"id": "INC-1001", "title": "Storage I/O Failure", "severity": "high", "status": "Closed", "impact": "High", "created": "May 22, 06:30 AM", "updated": "May 22, 07:06 AM", "mttr": "36m"},
]


def get_live_metrics():
    """Simulate real-time metric fluctuation."""
    live = []
    for s in SERVERS:
        if s["status"] == "stopped":
            live.append(s.copy())
            continue
        cpu = max(1.0, min(99.0, s["cpu"] + random.uniform(-5, 5)))
        mem = max(1.0, min(99.0, s["mem"] + random.uniform(-3, 3)))
        live.append({**s, "cpu": round(cpu, 1), "mem": round(mem, 1)})
    return live
