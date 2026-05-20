FROM python:3.11-slim AS backend

WORKDIR /app
COPY backend /app/backend
RUN pip install --no-cache-dir -e /app/backend
COPY alembic.ini /app/alembic.ini

FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM backend AS runtime
COPY --from=frontend /frontend/dist /app/frontend/dist
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
