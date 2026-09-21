FROM node:22-bookworm AS web-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SOLVER_API_URL=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SOLVER_API_URL=$VITE_SOLVER_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]

FROM python:3.13-slim AS solver
WORKDIR /app
COPY requirements.local.txt ./
RUN pip install --no-cache-dir -r requirements.local.txt
COPY server ./server
COPY models ./models
COPY data ./data
EXPOSE 8000
CMD ["uvicorn", "server.fastapi_solver:app", "--host", "0.0.0.0", "--port", "8000"]
