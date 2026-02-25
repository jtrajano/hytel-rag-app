FROM python:3.11-slim

WORKDIR /app

# Install only what these jobs need
RUN pip install --no-cache-dir \
    google-cloud-bigquery[pandas]>=3.0.0 \
    google-cloud-bigquery-storage \
    pandas

# Both ingest scripts share the same image
COPY ingest_adpc_pm25.py .
COPY ingest_adpc_province_timeseries.py .

# Each Cloud Run Job overrides --args to select the script
ENTRYPOINT ["python"]
CMD ["ingest_adpc_pm25.py"]
