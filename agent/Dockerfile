FROM python:3.12-slim

WORKDIR /agent

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mco_agent.py .

# All config via environment variables:
#   MCO_SERVER      - dashboard URL (required)
#   MCO_API_KEY     - agent API key (required)
#   MCO_INTERVAL    - push interval in seconds (default: 30)
#   MCO_PROVIDER    - cloud provider label
#   MCO_REGION      - region label
#   MCO_SERVER_ID   - server ID
#   MCO_SERVER_NAME - server display name

CMD ["python", "mco_agent.py"]
