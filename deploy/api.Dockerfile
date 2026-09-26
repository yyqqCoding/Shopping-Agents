FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt ./
COPY commerce-common ./commerce-common
COPY shopping-agent ./shopping-agent
RUN pip install --no-cache-dir -r requirements.txt
COPY examples/demo_common ./examples/demo_common
COPY examples/assistant/api ./examples/assistant/api
COPY examples/assistant/data ./examples/assistant/data
RUN useradd --create-home --uid 10001 app
USER app
EXPOSE 8004
CMD ["python", "-m", "uvicorn", "assistant.api.main:app", "--app-dir", "examples", "--host", "0.0.0.0", "--port", "8004", "--workers", "1", "--timeout-graceful-shutdown", "30"]
