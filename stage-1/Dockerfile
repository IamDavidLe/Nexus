FROM python:3.11-slim
WORKDIR /app
COPY src /app/src
EXPOSE 8080
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "src.main"]
