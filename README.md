# Three-Tier App on AWS EKS + ECR (Learning Project)

A small three-tier web application built specifically to practice deploying
containers to **AWS ECR** and **AWS EKS**. Keep everything simple: a JS/Nginx
frontend, a Spring Boot backend, and PostgreSQL.

```
Browser
   |
   v
Frontend Container (Nginx, port 80)
   |
   v
Spring Boot Backend (Java 21, port 8080)
   |
   v
PostgreSQL (port 5432)
```

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Prerequisites](#prerequisites)
3. [Local Development](#local-development)
4. [Test the Backend](#test-the-backend)
5. [Build Docker Images](#build-docker-images)
6. [Create ECR Repositories](#create-ecr-repositories)
7. [Push Images to ECR](#push-images-to-ecr)
8. [Create EKS Cluster](#create-eks-cluster)
9. [Deploy to EKS](#deploy-to-eks)
10. [Access the Application](#access-the-application)
11. [EKS Access to ECR (Permissions)](#eks-access-to-ecr-permissions)
12. [How Everything Communicates](#how-everything-communicates)
13. [Troubleshooting](#troubleshooting)
14. [EKS/ECR Practice Exercises](#eksecr-practice-exercises)

---

## Project Structure

```
eks-three-tier-app/
│
├── frontend/
│   ├── index.html        - Main HTML page (form + item list)
│   ├── style.css         - Styling
│   ├── app.js            - Fetches backend APIs, renders items
│   ├── nginx.conf        - Nginx config; proxies /api to backend
│   └── Dockerfile        - Builds Nginx image with static files
│
├── backend/
│   ├── pom.xml           - Maven build file (Spring Boot, JPA, PostgreSQL)
│   ├── Dockerfile        - Multi-stage build: Maven -> JRE image
│   └── src/main/
│       ├── java/com/example/app/
│       │   ├── Application.java         - Spring Boot entry point
│       │   ├── controller/ItemController.java - REST endpoints
│       │   ├── model/Item.java          - JPA entity (items table)
│       │   ├── repository/ItemRepository.java - Spring Data JPA repo
│       │   └── service/ItemService.java - Business logic
│       └── resources/
│           └── application.properties   - DB config via env vars
│
├── database/
│   └── init.sql          - Creates the items table on first DB startup
│
├── k8s/
│   ├── namespace.yaml            - Namespace: three-tier-app
│   ├── frontend-deployment.yaml  - Runs Nginx frontend pods
│   ├── frontend-service.yaml     - LoadBalancer (external access to frontend)
│   ├── backend-deployment.yaml   - Runs Spring Boot backend pods
│   ├── backend-service.yaml      - ClusterIP (internal backend access)
│   ├── postgres-deployment.yaml  - Runs PostgreSQL pod
│   ├── postgres-service.yaml     - ClusterIP (internal DB access)
│   ├── postgres-secret.yaml      - Secret: DB password
│   └── postgres-configmap.yaml   - ConfigMap: DB host/port/name/user
│
├── docker-compose.yml  - Runs all three tiers locally
└── README.md           - This file
```

---

## Prerequisites

You need these tools installed on your machine:

| Tool          | Purpose                                        |
|---------------|------------------------------------------------|
| **Java 21**   | Compile/run the Spring Boot backend            |
| **Maven**     | Build the backend into a JAR                   |
| **Docker**    | Build and run containers locally               |
| **AWS CLI**   | Interact with AWS (ECR, EKS)                   |
| **kubectl**   | Interact with Kubernetes clusters              |
| **eksctl**    | Optional but easiest way to create EKS clusters|

You also need:

- An **AWS account** with an IAM user that has permissions for ECR and EKS
  (for this learning project, using an administrative or broad-access user is
  fine).
- AWS credentials configured. Run `aws configure` and set:
  - AWS Access Key ID
  - AWS Secret Access Key
  - Default region (e.g. `us-east-1`)
  - Default output format (e.g. `json`)

Verify your setup:

```bash
java -version            # expect Java 21
mvn -version             # expect Maven 3.8+
docker --version
aws --version
kubectl version --client
eksctl version
```

---

## Local Development

Build and start all three containers:

```bash
docker compose up --build
```

This does the following:

1. Builds the **frontend** Nginx image.
2. Builds the **backend** Spring Boot image (downloads Maven deps, compiles,
   packages a JAR, copies it into a lightweight Java 21 runtime image).
3. Pulls the **postgres** image and runs the init script.
4. Connects everything via a shared Docker network.

### Access the application

- Frontend: <http://localhost:8081>
- Backend (direct): <http://localhost:8080>

Stop everything with:

```bash
docker compose down
```

To also delete the database volume:

```bash
docker compose down -v
```

---

## Test the Backend

With the containers running, open a terminal and try:

### Health check

```bash
curl http://localhost:8080/api/health
# {"status":"UP"}
```

### List items

```bash
curl http://localhost:8080/api/items
# []
```

### Add an item

```bash
curl -X POST http://localhost:8080/api/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Hello World"}'
# {"id":1,"name":"Hello World","createdAt":"..."}
```

List items again to confirm it was saved:

```bash
curl http://localhost:8080/api/items
```

---

## Build Docker Images

Build the two images locally:

```bash
docker build -t frontend ./frontend
docker build -t backend ./backend
```

Verify they exist:

```bash
docker images
```

---

## Create ECR Repositories

First, set some environment variables so the commands are reusable:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export FRONTEND_ECR_REPOSITORY=frontend
export BACKEND_ECR_REPOSITORY=backend
```

Create two ECR repositories:

```bash
aws ecr create-repository --repository-name $FRONTEND_ECR_REPOSITORY --region $AWS_REGION
aws ecr create-repository --repository-name $BACKEND_ECR_REPOSITORY --region $AWS_REGION
```

Verify they were created:

```bash
aws ecr describe-repositories --region $AWS_REGION
```

---

## Push Images to ECR

### 1. Authenticate Docker with ECR

```bash
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

This command generates a temporary password and logs Docker into your private
ECR registry.

### 2. Tag the images

Tag the locally built images with their full ECR URIs:

```bash
docker tag frontend \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_ECR_REPOSITORY:latest

docker tag backend \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPOSITORY:latest
```

### 3. Push the images

```bash
docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_ECR_REPOSITORY:latest

docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPOSITORY:latest
```

### 4. Verify images exist in ECR

```bash
aws ecr describe-images \
  --repository-name $FRONTEND_ECR_REPOSITORY \
  --region $AWS_REGION

aws ecr describe-images \
  --repository-name $BACKEND_ECR_REPOSITORY \
  --region $AWS_REGION
```

You should see the image tag `latest` and its sha256 digest.

---

## Create EKS Cluster

The **easiest** beginner-friendly method is `eksctl` because it creates the
control plane, the node group, and configures your `kubectl` in one command.

```bash
eksctl create cluster \
  --name three-tier-cluster \
  --region $AWS_REGION \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 3 \
  --managed
```

What each flag does:

- `--name` - name of the EKS cluster.
- `--region` - AWS region to create it in.
- `--nodegroup-name` - name for the worker node group.
- `--node-type` - EC2 instance type for worker nodes (`t3.medium` is cheap and
  has enough RAM for this app).
- `--nodes` - initial number of worker nodes.
- `--nodes-min` / `--nodes-max` - autoscaling range.
- `--managed` - use managed node groups (EKS manages the nodes for you).

By default, `eksctl` gives the node IAM role `AmazonEKSWorkerNodePolicy`,
`AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryReadOnly`, and
`AmazonEKS_EC2ContainerRegistryReadOnly`. The ECR pull permission is included
automatically.

After creation completes, confirm you can talk to the cluster:

```bash
kubectl get nodes
```

This should list your worker nodes with status `Ready`.

To delete the cluster when done (to avoid ongoing AWS charges):

```bash
eksctl delete cluster --name three-tier-cluster --region $AWS_REGION
```

---

## Deploy to EKS

### 1. Substitute the image placeholders

The `frontend-deployment.yaml` and `backend-deployment.yaml` use placeholders.
Replace them with your real values before applying. The simplest way is to use
`envsubst` (available on Linux/macOS; on Windows use Git Bash or WSL):

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export FRONTEND_ECR_REPOSITORY=frontend
export BACKEND_ECR_REPOSITORY=backend

envsubst < k8s/backend-deployment.yaml  | kubectl apply -f -
envsubst < k8s/frontend-deployment.yaml | kubectl apply -f -
```

Apply the rest of the Kubernetes manifests (namespace, services, configmap,
secret, postgres deployment):

```bash
kubectl apply -f k8s/
```

**Note:** `kubectl apply -f k8s/` will apply everything in the folder including
the deployment files that still contain `${...}` placeholders. To avoid
submitting broken YAML, either (a) use the two `envsubst` commands above for
the deployments and `kubectl apply -f k8s/*.yaml` for the rest, or (b) edit the
two deployment YAML files and hard-code your ECR image URIs. The simplest
approach for beginners is (b): edit the two files, replace the placeholders
with your actual image URIs, then run `kubectl apply -f k8s/`.

### 2. Watch the resources come up

```bash
kubectl get pods -n three-tier-app
kubectl get deployments -n three-tier-app
kubectl get services -n three-tier-app
```

Wait until all three pods show `Running` and `1/1` ready.

### 3. Useful kubectl commands

```bash
# Detailed info about a single pod (events, status, images)
kubectl describe pod <pod-name> -n three-tier-app

# Live logs from a pod
kubectl logs <pod-name> -n three-tier-app

# Follow logs in real time
kubectl logs -f <pod-name> -n three-tier-app

# List everything in the namespace
kubectl get all -n three-tier-app
```

Replacing `<pod-name>` with an actual pod name (e.g. `backend-6b8f7d4c5c-abcde`).

---

## Access the Application

The frontend Service is of type `LoadBalancer`, which EKS provisions an AWS
Elastic Load Balancer for. Get its external address:

```bash
kubectl get svc frontend -n three-tier-app
```

Look for the `EXTERNAL-IP` column. It may show `<pending>` for a minute or two
while AWS provisions the load balancer. Once ready, it shows the external DNS
name.

Open the URL in your browser:

```
http://<EXTERNAL-IP>
```

You should see the Items Manager page. Add an item, refresh, and it persists in
PostgreSQL.

---

## EKS Access to ECR (Permissions)

### Conceptual explanation

When a Pod is created, Kubernetes tells the node to pull the container images
listed in the Deployment. On EKS, the **worker node** performs the image pull
from ECR. Because ECR is a private registry, the node must prove to AWS that
it is allowed to read from the ECR repository.

This is done with an **IAM role** attached to the EC2 worker nodes. The role
has a policy that grants ECR read permissions. When the node calls ECR, AWS
checks that role's permissions. This is why images are referenced with their
full registry URI and why you must push them to the same account/region.

### Simplest configuration

The default managed node group created by `eksctl` already includes the
IAMAWS-managed policy **`AmazonEC2ContainerRegistryReadOnly`** on the node IAM
role. This is the simplest and recommended setup and requires nothing extra.

If you created the cluster some other way and pulls fail with
`ImagePullBackOff` / `Unauthorized`, attach the policy to the node role:

```bash
aws iam attach-role-policy \
  --role-name <your-node-role-name> \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

To find your node role name, check the IAM roles in the AWS console, or:

```bash
aws iam list-roles --query "Roles[?contains(RoleName,'three-tier-cluster')].RoleName"
```

---

## How Everything Communicates

### In Kubernetes (EKS)

```
                 Internet
                    |
                    v
          frontend Service (LoadBalancer -> AWS ELB)
                    |
                    v
             Frontend Pods (Nginx, port 80)
                    |  (nginx proxies /api)
                    v
          backend Service (ClusterIP, internal DNS: backend)
                    |
                    v
             Backend Pods (Spring Boot, port 8080)
                    |  (JDBC to postgres:5432)
                    v
          postgres Service (ClusterIP, internal DNS: postgres)
                    |
                    v
             Postgres Pod (port 5432)
```

- **Frontend Service (LoadBalancer):** Exposes the frontend to the internet so
  you can reach it from your browser. The AWS load balancer forwards traffic to
  the Nginx pods.
- **Backend Service (ClusterIP):** Internal-only. Gives the frontend pods a
  stable DNS name (`backend`) and load-balances across backend pods. Nothing
  outside the cluster can reach it directly, which is fine.
- **Postgres Service (ClusterIP):** Internal-only. Gives the backend pods a
  stable DNS name (`postgres`). It points to the PostgreSQL pod.
- **Nginx proxy:** The frontend Nginx config forwards any request to `/api/*`
  to `http://backend:8080/api/*`, so the browser only talks to the frontend
  and never needs to know the backend's address.

Inside the cluster, a Service named `backend` resolves to
`backend.three-tier-app.svc.cluster.local` (or just `backend` from within the
same namespace), and `postgres` resolves to PostgreSQL the same way.

### In Docker Compose (local)

The same three tiers run as containers on one Docker network. Service names in
`docker-compose.yml` act as DNS names, so `backend` and `postgres` resolve
exactly as they do in Kubernetes. There is no load balancer locally — you
reach the frontend at `http://localhost:8081` and the backend directly at
`http://localhost:8080`.

---

## Troubleshooting

For each problem, use these `kubectl` commands to investigate:

```bash
kubectl get pods -n three-tier-app
kubectl describe pod <pod-name> -n three-tier-app
kubectl logs <pod-name> -n three-tier-app
kubectl get events -n three-tier-app
```

### 1. Pod stuck in `Pending`

The scheduler can't place the pod (usually not enough node resources, or nodes
not ready).

- Check: `kubectl get nodes` to confirm nodes are `Ready`.
- Check: `kubectl describe pod <pod-name> -n three-tier-app` and look for
  `FailedScheduling` events such as "Insufficient cpu" or "Insufficient memory".
- Fix: use bigger nodes, add nodes, or reduce replica counts.

### 2. Pod stuck in `CrashLoopBackOff`

The container starts and immediately crashes, over and over.

- Check: `kubectl logs <pod-name> -n three-tier-app` to read the crash reason.
- For the backend, a common cause is it can't reach PostgreSQL (wrong host,
  port, or DB not ready). Confirm the `postgres` pod is running and ready
  before the backend starts its probes.

### 3. `ImagePullBackOff`

Kubernetes can't pull the container image.

- Check: `kubectl describe pod <pod-name> -n three-tier-app` for the reason
  (often `Unauthorized` or `manifest unknown`).
- Fix: verify the image URI in the deployment matches the ECR repository
  exactly. Confirm you authenticated/pushed correctly, and that the node IAM
  role has ECR read permission (see [EKS Access to ECR](#eks-access-to-ecr-permissions)).

### 4. Backend cannot connect to PostgreSQL

- Check: `kubectl get pods -n three-tier-app` — is `postgres` Running/Ready?
- Check: `kubectl get svc postgres -n three-tier-app` — does the Service exist
  and select the pod? Confirm the label selector (`app: postgres`) matches the
  pod labels.
- Check backend logs: `kubectl logs <backend-pod> -n three-tier-app` for JDBC
  connection errors.
- Verify the ConfigMap/Secret host, port, name, user, and password values match
  what PostgreSQL was started with.

### 5. Frontend cannot connect to backend

- Check: `kubectl get svc backend -n three-tier-app` — the Service must exist
  and select the backend pods.
- Check backend logs for errors.
- Verify the nginx config proxies `/api` to `http://backend:8080` — the service
  name `backend` must be correct and resolvable within the same namespace.

### 6. LoadBalancer does not get an external IP

- Check: `kubectl get svc frontend -n three-tier-app` — it may take 1-2 minutes.
- If it stays `<pending>`, check: `kubectl get events -n three-tier-app` for
  errors provisioning the load balancer (often a permissions or region issue on
  the cluster's IAM role).

### 7. Database credentials are incorrect

- Check: `kubectl describe secret postgres-secret -n three-tier-app` and
  `kubectl describe configmap postgres-config -n three-tier-app` to confirm the
  expected values (note: Secret data is base64-encoded; decode with
  `echo '<value>' | base64 -d`).
- Verify the backend `application.properties` reads these env vars with the
  exact same key names.
- Confirm PostgreSQL was initialized with the same DB name/user/password.

### 8. EKS cannot pull images from ECR

- Check the node IAM role has
  `AmazonEC2ContainerRegistryReadOnly` (see
  [EKS Access to ECR](#eks-access-to-ecr-permissions)).
- Confirm the images exist in ECR:
  `aws ecr describe-images --repository-name <repo> --region $AWS_REGION`.
- Verify the deployment image URI uses your account id and region and repository
  name exactly.

---

## EKS/ECR Practice Exercises

Work through these from easy to hard. For each, use the kubectl commands from
the [Troubleshooting](#troubleshooting) section to observe what happens.

### Beginner

1. **Delete a backend Pod and watch Kubernetes recreate it.**
   ```bash
   kubectl delete pod <backend-pod-name> -n three-tier-app
   kubectl get pods -n three-tier-app -w
   ```
   Notice how the Deployment quickly starts a new Pod to reach the desired
   replica count.

2. **Scale the backend from 1 replica to 3.**
   ```bash
   kubectl scale deployment backend --replicas=3 -n three-tier-app
   kubectl get pods -n three-tier-app
   ```
   Watch the `backend` Service route traffic across all replicas.

3. **Inspect Kubernetes Services.**
   ```bash
   kubectl get svc -n three-tier-app
   kubectl describe svc backend -n three-tier-app
   kubectl describe svc frontend -n three-tier-app
   ```

### Intermediate

4. **Change some Java code.**
   Edit the backend, e.g. change the health endpoint message in
   `ItemController.java`. Build a new image, tag it as version `v2`, push it to
   ECR, and update the Deployment to perform a rolling update:
   ```bash
   cd backend
   # ... edit source ...
   docker build -t backend .
   docker tag backend \
     $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPOSITORY:v2
   aws ecr get-login-password --region $AWS_REGION | \
     docker login --username AWS --password-stdin \
     $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
   docker push \
     $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPOSITORY:v2
   kubectl set image deployment/backend \
     backend=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPOSITORY:v2 \
     -n three-tier-app
   kubectl rollout status deployment/backend -n three-tier-app
   ```

5. **Check the Pod logs after upgrading.**
   ```bash
   kubectl get pods -n three-tier-app
   kubectl logs <new-backend-pod> -n three-tier-app
   ```

6. **Roll back the deployment.**
   ```bash
   kubectl rollout history deployment/backend -n three-tier-app
   kubectl rollout undo deployment/backend -n three-tier-app
   kubectl rollout status deployment/backend -n three-tier-app
   ```

7. **Change an environment variable.**
   Edit `k8s/postgres-configmap.yaml` (e.g. change `DB_NAME`), then:
   ```bash
   kubectl apply -f k8s/postgres-configmap.yaml
   kubectl rollout restart deployment/backend -n three-tier-app
   ```
   Watch how a ConfigMap change alone doesn't restart pods — you must restart
   the Deployment for the new environment to take effect.

### Advanced

8. **Break the PostgreSQL connection intentionally and troubleshoot it.**
   ```bash
   kubectl scale deployment postgres --replicas=0 -n three-tier-app
   kubectl get pods -n three-tier-app
   kubectl logs <backend-pod> -n three-tier-app
   kubectl describe pod <backend-pod> -n three-tier-app
   # bring it back
   kubectl scale deployment postgres --replicas=1 -n three-tier-app
   ```
   Observe how the backend recovers once the DB returns (thanks to liveness and
   readiness probes and the JPA/HikariCP reconnect).

9. **Experiment with different replica counts.**
   ```bash
   kubectl scale deployment frontend --replicas=3 -n three-tier-app
   kubectl scale deployment backend --replicas=5 -n three-tier-app
   kubectl get pods -n three-tier-app
   kubectl get endpoints backend -n three-tier-app
   ```
   Watch how the Service `endpoints` update to include all ready replicas.

---

## Staying Clean

When done, delete the cluster so you don't incur AWS charges:

```bash
eksctl delete cluster --name three-tier-cluster --region $AWS_REGION
```

Delete the ECR repositories (after deleting their images):

```bash
aws ecr delete-repository --repository-name $FRONTEND_ECR_REPOSITORY --force --region $AWS_REGION
aws ecr delete-repository --repository-name $BACKEND_ECR_REPOSITORY --force --region $AWS_REGION
```

Happy learning!
# eks-three-tier-app
