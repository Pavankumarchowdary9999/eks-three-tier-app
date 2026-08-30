# PROJECT BRIEF: Three-Tier App on AWS EKS + ECR (Learning Project)

This file gives you a complete, self-contained overview of this project so you can
understand it and help with it. Read it fully before making changes.

## What This Project Is

A deliberately simple three-tier web application built as a hands-on practice
environment for learning **Docker**, **AWS ECR** (Elastic Container Registry),
**Kubernetes**, and **AWS EKS** (Elastic Kubernetes Service).

It is a LEARNING project, not a production app. No auth, no complex frameworks,
no Redis/Kafka/Terraform/Helm/Istio/monitoring. Keep it simple.

## Architecture

A clean three-tier layout with a clear data flow:

```
Browser
   |
   v
Frontend Container (Nginx, static HTML/CSS/JS, port 80)
   |
   v  (nginx proxies /api/* to backend:8080)
Spring Boot Backend (Java 21, port 8080)
   |
   v  (JDBC to postgres:5432)
PostgreSQL (port 5432)
```

## Tech Stack

- **Frontend:** HTML + CSS + Vanilla JavaScript + Nginx
- **Backend:** Java 21 + Spring Boot 3.3.5 + Maven + Spring Web + Spring Data JPA + PostgreSQL driver
- **Database:** PostgreSQL
- **Containers:** Docker
- **Registry:** AWS ECR
- **Orchestration:** Kubernetes
- **Managed Kubernetes:** AWS EKS

## REST API (Backend, port 8080, base path /api)

- `GET  /api/items`        - list all items
- `POST /api/items`        - create item, body JSON: `{"name": "..."}`
- `GET  /api/health`       - health check, returns `{"status":"UP"}`

CORS is enabled with `@CrossOrigin(origins = "*")`.

### Item entity (maps to `items` table)

- `id`          - Long, auto-generated identity PK
- `name`        - String, not null
- `created_at`  - Instant (timestamp), set on creation

## Environment Variables (Backend)

Read from `application.properties`, must be provided at runtime:

| Variable       | Example       | Purpose               |
|----------------|---------------|-----------------------|
| `DB_HOST`      | `postgres`    | DB host (service name)|
| `DB_PORT`      | `5432`        | DB port               |
| `DB_NAME`      | `itemsdb`     | Database name         |
| `DB_USERNAME`  | `postgres`    | DB user               |
| `DB_PASSWORD`  | `postgres`    | DB password           |

`application.properties`:
```properties
spring.datasource.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
server.port=8080
```

## Project Structure

```
eks-three-tier-app/
│
├── frontend/
│   ├── index.html        - main page (form + item list)
│   ├── style.css         - styling
│   ├── app.js            - fetches /api/*, renders items
│   ├── nginx.conf        - proxies /api/ -> http://backend:8080/api/
│   └── Dockerfile        - Nginx image with static files (port 80)
│
├── backend/
│   ├── pom.xml           - Maven build (Spring Boot 3.3.5, Java 21)
│   ├── Dockerfile        - multi-stage: maven build -> eclipse-temurin:21-jre-alpine
│   └── src/main/
│       ├── java/com/example/app/
│       │   ├── Application.java              - Spring Boot entry point
│       │   ├── controller/ItemController.java - REST endpoints
│       │   ├── model/Item.java               - JPA entity
│       │   ├── repository/ItemRepository.java- Spring Data repository
│       │   └── service/ItemService.java      - business logic
│       └── resources/application.properties  - env-var DB config
│
├── database/
│   └── init.sql          - creates items table (id, name, created_at)
│
├── k8s/                  - all Kubernetes manifests (namespace: three-tier-app)
│   ├── namespace.yaml
│   ├── frontend-deployment.yaml   - Nginx pods; image uses ECR placeholders
│   ├── frontend-service.yaml      - type LoadBalancer (external access)
│   ├── backend-deployment.yaml    - Spring Boot pods; image uses ECR placeholders
│   ├── backend-service.yaml       - ClusterIP (internal)
│   ├── postgres-deployment.yaml   - postgres:16-alpine pod
│   ├── postgres-service.yaml      - ClusterIP (internal)
│   ├── postgres-secret.yaml       - Secret: DB_PASSWORD
│   └── postgres-configmap.yaml    - ConfigMap: DB_HOST/PORT/NAME/USERNAME
│
├── docker-compose.yml   - runs all 3 tiers locally
└── README.md            - full guide (build, ECR, EKS, troubleshooting, exercises)
```

## IMPORTANT Implementation Notes (for anyone editing)

1. **DB table name:** JPA uses `@Table(name = "items")`. The `init.sql` creates the
   same table. `created_at` uses a non-updatable Instant column.

2. **Frontend API path:** `app.js` calls the RELATIVE path `/api/items`. There is no
   CORS problem between browser and backend because the browser never talks directly
   to the backend — nginx proxies `/api/` to `http://backend:8080/api/`. So nginx
   must know the backend service name `backend`.

3. **Service names are DNS:** In both Docker Compose and Kubernetes, the service names
   `backend` and `postgres` resolve as hostnames. Keep them in sync everywhere:
   - nginx.conf proxies to `backend:8080`
   - backend DB_HOST is `postgres`
   - ConfigMap DB_HOST is `postgres`

4. **K8s image placeholders:** `frontend-deployment.yaml` and `backend-deployment.yaml`
   contain literal placeholders:
   ```
   ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY}:latest
   ```
   `kubectl apply` does NOT substitute `${...}`. Before applying, either:
   - (Recommended for beginners) hard-code the real ECR image URI into the two
     deployment files, then `kubectl apply -f k8s/`, or
   - run `envsubst < k8s/frontend-deployment.yaml | kubectl apply -f -` (and same for
     backend).

5. **Environments / vars:** The K8s Deployments wire env vars from the ConfigMap
   (`postgres-config`) and Secret (`postgres-secret`) into the backend pod. The
   postgres pod also sources its `POSTGRES_DB/USER/PASSWORD` from the same
   ConfigMap/Secret — all DB credentials must match between the config and where the
   backend expects them.

6. **Backend images:** Should be referenced by tag (e.g. `latest`, `v2`) for the
   rolling-update practice exercises.

## Running Locally (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:8081
- Backend:  http://localhost:8080

Test the backend:
```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/items
curl -X POST http://localhost:8080/api/items -H "Content-Type: application/json" -d '{"name":"Hello"}'
```

## AWS ECR + EKS Workflow (summary)

1. Build images: `docker build -t frontend ./frontend` and `docker build -t backend ./backend`
2. Create ECR repos (named `frontend` and `backend`)
3. Authenticate: `aws ecr get-login-password | docker login --username AWS --password-stdin <uri>`
4. Tag + push images to ECR
5. Create EKS cluster with `eksctl` (managed node group includes ECR read policy)
6. Apply K8s manifests, get LoadBalancer EXTERNAL-IP, open in browser

Full commands, explanations, and troubleshooting are in **README.md**. The
troubleshooting section covers: Pending pods, CrashLoopBackOff, ImagePullBackOff,
backend-to-Postgres failures, frontend-to-backend failures, LoadBalancer stuck at
`<pending>`, wrong DB credentials, and ECR pull permission issues (worker node IAM
role needs `AmazonEC2ContainerRegistryReadOnly`).

## Out of Scope (Do NOT add)

Authentication, user accounts, Redis, Kafka, Terraform, Helm, Istio, service mesh,
CI/CD, Prometheus/Grafana, complex monitoring, production security, complex
networking, or multiple backend microservices.
