# Kubernetes deployment

Kustomize manifests are in `deploy/k8s/`. They are configuration templates,
not proof of a deployed application. No Kubernetes context or local cluster
was available during verification.

## Prerequisites

- Docker Desktop Kubernetes, kind, Minikube, or another explicitly selected
  local cluster.
- `kubectl` with a verified local context and Kustomize support.
- A CNI that enforces NetworkPolicy if policies are relied on.
- PostgreSQL reachable from the cluster, an external secret manager, and
  private images built for the cluster.
- For staging/production: approved DNS, TLS, storage, database backup,
  provider credentials, and a protected secret manager.

Inspect the client and context before any apply:

```powershell
kubectl version --client
kubectl config get-contexts
kubectl config current-context
```

This environment had kubectl/Kustomize installed but no current context.
Do not create or switch to a remote context without explicit authorization.

## Render-only validation

These commands do not contact a cluster:

```powershell
kubectl kustomize deploy\k8s\overlays\local
kubectl kustomize deploy\k8s\overlays\staging
kubectl kustomize deploy\k8s\overlays\production
kubectl kustomize deploy\k8s\migrations\overlays\local
kubectl kustomize deploy\k8s\migrations\overlays\staging
kubectl kustomize deploy\k8s\migrations\overlays\production
```

All six overlays rendered successfully in the current local validation.

## Local cluster procedure

Only after you have intentionally enabled/created a local cluster and confirmed
the context is local:

1. Build the API and web images and load them into the local cluster's image
   store using the instructions for that cluster.
2. Review the local overlay, namespace, ports, ingress, and PVC before apply.
3. Create the namespace, then provide `DATABASE_URL`, `JWT_SECRET`,
   `REFRESH_TOKEN_SECRET`, and `ENCRYPTION_KEY` from a protected local env
   file or local secret manager. Never commit Kubernetes Secret manifests.
4. Run the migration Job and inspect its logs; only then apply the application
   overlay.
5. Inspect pods, events, readiness, logs, and actual API/web connectivity.

Example after setting up a local namespace and secret through an approved
local-only method:

```powershell
kubectl apply -f deploy\k8s\overlays\local\namespace.yaml
kubectl apply -k deploy\k8s\migrations\overlays\local
kubectl wait --for=condition=complete job/patafundi-migrate -n patafundi-local --timeout=15m
kubectl logs job/patafundi-migrate -n patafundi-local
kubectl apply -k deploy\k8s\overlays\local
kubectl get pods,services,ingress -n patafundi-local
kubectl rollout status deployment/patafundi-api -n patafundi-local
kubectl rollout status deployment/patafundi-web -n patafundi-local
```

For each migration release, inspect and delete only the previous completed
Job object before recreating it. Never delete the database or PVC to rerun a
migration. Staging/production overlays contain placeholder image names/hosts
and require review before use.

## Design constraints

The API runs one replica because timers and PostgreSQL queue consumption are
currently started in the API process. API autoscaling could duplicate periodic
jobs. Uploaded fallback files use a PVC; production should use verified private
object storage. NetworkPolicies assume a compatible CNI and ingress-nginx
labels. Egress is not fully restricted. These need cluster-specific validation.

**Actual local cluster deployment: NOT RUN.** No current kubectl context was
configured. Rendering manifests is not equivalent to deploying or validating
workloads.

