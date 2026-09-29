# Fixture: downloads a dependency at build time, must FAIL the clean container check.
FROM python:3.12-alpine
RUN pip install --no-cache-dir requests
COPY server.py /app/server.py
CMD ["python", "/app/server.py"]
