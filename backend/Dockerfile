FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Ensure the data directory exists for SQLite volume mount
RUN mkdir -p /data

EXPOSE 8000

# No --reload in production (also removes watchfiles dependency need)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
