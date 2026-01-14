# X2A Production Authentication Plan

**Status:** NOT YET IMPLEMENTED - This is a plan for future implementation
**Date:** 2026-01-13
**Context:** PoC phase - currently using local kubeconfig for development

## Background

The X2A plugin currently works in development mode by reading `~/.kube/kubeconfig` from the local filesystem. This works for PoC but is not suitable for production RHDH deployment.

## Requirements (From User)

1. **Deployment**: RHDH runs inside Kubernetes cluster
2. **Audit**: Per-user audit trails are CRITICAL
3. **Scope**: Plugin creates resources in separate `x2a` namespace
4. **Responsibility**: Don't manage RHDH config, only manage X2A integration

## Chosen Approach: ServiceAccount + Impersonation

### Why This Approach?

Based on analysis of existing RHDH plugins (lightspeed, orchestrator, bulk-import), this is the standard pattern:

1. **Simple**: No OIDC token management required
2. **Standard**: Follows existing RHDH plugin patterns exactly
3. **Audit-Compliant**: Preserves user identity in K8s audit logs
4. **Production-Ready**: Works for in-cluster RHDH deployment

### How It Works

#### Two-Layer Authentication

**Layer 1: Base Credentials (RHDH ServiceAccount)**
```
RHDH Pod → Kubernetes auto-mounts ServiceAccount token
           at /var/run/secrets/kubernetes.io/serviceaccount/token
         → Plugin calls loadFromCluster() to read this token
         → Authenticates to K8s API as: system:serviceaccount:rhdh:rhdh-backend
```

**Layer 2: User Identity (Impersonation)**
```
User Request → RHDH extracts user identity
            → Plugin gets: user:default/john.doe
            → Adds header: Impersonate-User: user:default/john.doe
            → K8s checks: Does john.doe have permission?
            → K8s audit logs: john.doe performed action
```

### Credential Flow

```
Development Mode (Current):
┌─────────────────────────┐
│ Your Laptop             │
│                         │
│ loadFromDefault()       │
│        ↓                │
│ ~/.kube/kubeconfig ─────┼──→ Your personal K8s credentials
│                         │
└─────────────────────────┘

Production Mode (Future):
┌────────────────────────────────────────────────┐
│ Kubernetes Cluster                             │
│                                                │
│  ┌──────────────────────────────────┐          │
│  │ RHDH Pod (namespace: rhdh)       │          │
│  │                                  │          │
│  │  X2A Plugin                      │          │
│  │    loadFromCluster()             │          │
│  │         ↓                        │          │
│  │  /var/run/secrets/.../token ─────┼──→ ServiceAccount token
│  │  (auto-mounted by K8s)           │    (created by K8s)
│  │                                  │          │
│  │  + Impersonate-User: john.doe ───┼──→ User identity
│  │    (from Backstage)              │    (from httpAuth)
│  └──────────────────────────────────┘          │
│                                                │
│  ┌──────────────────────────────────┐          │
│  │ X2A Namespace                    │          │
│  │  - Plugin creates resources here │          │
│  └──────────────────────────────────┘          │
└────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Code Changes

#### 1. Update `plugins/x2a-backend/src/plugin.ts`

Add user authentication services:

```typescript
env.registerInit({
  deps: {
    logger: coreServices.logger,
    config: coreServices.rootConfig,
    http: coreServices.httpRouter,
    httpAuth: coreServices.httpAuth,      // ADD
    userInfo: coreServices.userInfo,      // ADD
  },
  async init({ logger, config, http, httpAuth, userInfo }) {
    const router = await createRouter({
      logger,
      config,
      httpAuth,    // ADD
      userInfo,    // ADD
    });
    // ... rest
  },
});
```

#### 2. Update `plugins/x2a-backend/src/service/router.ts`

**Update RouterOptions:**
```typescript
export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  httpAuth: HttpAuthService;    // ADD
  userInfo: UserInfoService;    // ADD
}
```

**Extract user in endpoints:**
```typescript
router.get('/pods/:namespace', async (request, response) => {
  const { namespace } = request.params;

  // Extract user identity from Backstage
  const credentials = await httpAuth.credentials(request);
  const user = await userInfo.getUserInfo(credentials);
  const userEntity = user.userEntityRef;

  logger.info(`User ${userEntity} listing pods in namespace: ${namespace}`);

  try {
    const pods = await k8sService.listPodsInNamespace(namespace, userEntity);
    // ... rest
  } catch (error) {
    // ... error handling
  }
});
```

**Pattern from lightspeed plugin (line 80-82):**
```typescript
const credentials = await httpAuth.credentials(req);
const user = await userInfo.getUserInfo(credentials);
const userEntity = user.userEntityRef;
```

#### 3. Update `plugins/x2a-backend/src/service/KubernetesService.ts`

**Add in-cluster detection:**
```typescript
export class KubernetesService {
  private readonly kc: k8s.KubeConfig;
  private readonly k8sApi: k8s.CoreV1Api;
  private readonly inCluster: boolean;  // ADD

  constructor(
    _config: Config,
    private readonly logger: LoggerService,
  ) {
    this.kc = new k8s.KubeConfig();

    // Try in-cluster first (production)
    try {
      this.kc.loadFromCluster();
      this.inCluster = true;
      this.logger.info('Loaded in-cluster Kubernetes configuration');
    } catch (error) {
      // Fallback to local kubeconfig (development)
      this.inCluster = false;
      this.logger.info('Not running in-cluster, loading from kubeconfig');

      // Existing kubeconfig loading logic
      if (!process.env.KUBECONFIG) {
        const path = require('path');
        const os = require('os');
        const kubeconfigPath = path.join(os.homedir(), '.kube', 'kubeconfig');
        const fs = require('fs');

        if (fs.existsSync(kubeconfigPath)) {
          process.env.KUBECONFIG = kubeconfigPath;
          this.logger.info(`Setting KUBECONFIG to ${kubeconfigPath}`);
        }
      }

      this.kc.loadFromDefault();
      this.logger.info('Loaded Kubernetes configuration from kubeconfig');
    }

    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
  }
}
```

**Add impersonation to methods:**
```typescript
async listPodsInNamespace(
  namespace: string,
  userEntity?: string  // ADD optional user parameter
): Promise<PodInfo[]> {
  try {
    this.logger.info(`Fetching pods from namespace: ${namespace}`);

    const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);

    // Add impersonation in production mode
    if (userEntity && this.inCluster) {
      this.logger.info(`Impersonating user: ${userEntity}`);

      k8sApi.setDefaultAuthentication({
        applyToRequest: (opts) => {
          opts.headers = {
            ...opts.headers,
            'Impersonate-User': userEntity,
          };
        },
      });
    }

    const response = await k8sApi.listNamespacedPod(namespace);

    // ... rest of existing logic
  } catch (error: any) {
    // ... existing error handling
  }
}
```

**Files Modified:**
- `plugins/x2a-backend/src/plugin.ts`
- `plugins/x2a-backend/src/service/router.ts`
- `plugins/x2a-backend/src/service/KubernetesService.ts`

**Estimated Code Changes:** ~100 lines

### Phase 2: RBAC Manifests

Create `workspaces/x2a/kubernetes/` directory with:

#### 1. `namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: x2a
  labels:
    app: x2a
    managed-by: rhdh
```

#### 2. `rbac.yaml`

```yaml
# NOTE: Edit this file before applying!
# Replace:
#   - 'rhdh-backend' with your RHDH ServiceAccount name
#   - 'rhdh' with your RHDH namespace

---
# Allow RHDH ServiceAccount to impersonate users
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: rhdh-x2a-impersonator
  labels:
    app.kubernetes.io/name: x2a
    app.kubernetes.io/component: rbac
rules:
- apiGroups: [""]
  resources: ["users", "groups"]
  verbs: ["impersonate"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: rhdh-x2a-impersonator
  labels:
    app.kubernetes.io/name: x2a
    app.kubernetes.io/component: rbac
subjects:
- kind: ServiceAccount
  name: rhdh-backend  # EDIT THIS
  namespace: rhdh     # EDIT THIS
roleRef:
  kind: ClusterRole
  name: rhdh-x2a-impersonator
  apiGroup: rbac.authorization.k8s.io
---
# Define permissions for x2a namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: rhdh-x2a-manager
  labels:
    app.kubernetes.io/name: x2a
    app.kubernetes.io/component: rbac
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "pods/status"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["configmaps", "secrets", "services"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
# Grant RHDH ServiceAccount access to x2a namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: rhdh-x2a-manager
  namespace: x2a
  labels:
    app.kubernetes.io/name: x2a
    app.kubernetes.io/component: rbac
subjects:
- kind: ServiceAccount
  name: rhdh-backend  # EDIT THIS
  namespace: rhdh     # EDIT THIS
roleRef:
  kind: ClusterRole
  name: rhdh-x2a-manager
  apiGroup: rbac.authorization.k8s.io
```

#### 3. `user-rbac-example.yaml`

```yaml
# Template: Grant a Backstage user access to X2A resources
# Instructions:
#   1. Copy this file for each user
#   2. Replace CHANGEME with user's Backstage userEntityRef
#      (Find in RHDH: User Settings → About → Entity Reference)
#   3. Apply: kubectl apply -f user-rbac-<username>.yaml

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: x2a-user-readonly
  namespace: x2a
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: CHANGEME-x2a-access
  namespace: x2a
subjects:
- kind: User
  name: "user:default/CHANGEME"  # Replace with actual userEntityRef
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: x2a-user-readonly
  apiGroup: rbac.authorization.k8s.io
```

#### 4. `kubernetes/README.md`

```markdown
# X2A Kubernetes RBAC Setup

## Prerequisites

1. RHDH is installed and running
2. You have `cluster-admin` permissions
3. You know your RHDH ServiceAccount name and namespace

## Find Your RHDH ServiceAccount

```bash
# Find RHDH namespace
kubectl get namespaces | grep -i rhdh

# Find ServiceAccount
kubectl get serviceaccounts -n <rhdh-namespace>
```

## Installation

### 1. Edit rbac.yaml

Replace placeholders:
- `rhdh-backend` → your actual ServiceAccount name
- `rhdh` → your actual namespace

### 2. Apply manifests

```bash
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
```

### 3. Verify

```bash
# Test impersonation permission
kubectl auth can-i impersonate users \
  --as=system:serviceaccount:<ns>/<sa>

# Test x2a access
kubectl auth can-i list pods -n x2a \
  --as=system:serviceaccount:<ns>/<sa>

# Both should return "yes"
```

### 4. Grant user access

For each user:
1. Copy `user-rbac-example.yaml`
2. Replace `CHANGEME` with user's Backstage userEntityRef
3. Apply: `kubectl apply -f user-rbac-<name>.yaml`

## Troubleshooting

**Error: User has no permissions**
- Verify RoleBinding in x2a namespace
- Check userEntityRef matches exactly

**Error: Can't impersonate**
- Verify ClusterRoleBinding references correct ServiceAccount
- Check ServiceAccount name/namespace
```

### Phase 3: Documentation

#### Update `INSTALLATION.md`

Create comprehensive installation guide covering:
1. Kubernetes RBAC setup
2. Adding plugin to RHDH
3. User access configuration
4. Verification steps
5. Troubleshooting

#### Update `DEVELOPMENT.md`

Add section explaining authentication modes:
- Development: local kubeconfig
- Production: ServiceAccount + impersonation

#### Update `README.md`

Add overview of production requirements and security model.

## User Responsibilities

When installing X2A plugin, users must:

1. **Find RHDH ServiceAccount details**:
   ```bash
   kubectl get serviceaccounts -n <rhdh-namespace>
   ```

2. **Edit and apply RBAC manifests**:
   - Update `rbac.yaml` with their ServiceAccount name/namespace
   - Apply: `kubectl apply -f kubernetes/rbac.yaml`

3. **Configure user access**:
   - Copy `user-rbac-example.yaml` for each user
   - Replace with actual Backstage userEntityRef
   - Apply per-user RoleBindings

4. **Add plugin to RHDH**:
   - Add to dynamic plugins configuration
   - Restart RHDH

## What We Don't Manage

- RHDH installation/configuration
- RHDH ServiceAccount creation
- RHDH authentication (OAuth/OIDC)
- Which namespace RHDH runs in

## Security Model

### Kubernetes RBAC Layers

```
1. RHDH ServiceAccount
   ├─ ClusterRole: impersonate users ✓
   └─ RoleBinding in x2a: manage resources ✓

2. Backstage User (e.g., john.doe)
   └─ RoleBinding in x2a: read pods ✓

3. API Call Flow
   Auth: system:serviceaccount:rhdh:rhdh-backend
   Impersonate: user:default/john.doe
   Permission Check: john.doe's RBAC
   Audit Log: john.doe listed pods
```

### Why This is Secure

1. **Least Privilege**: RHDH SA only has impersonation + base x2a access
2. **User-Level Control**: Each user needs explicit K8s RBAC
3. **Audit Trail**: K8s logs show actual user, not service account
4. **Namespace Isolation**: RoleBinding limits scope to x2a namespace

## Testing Plan

### Development Testing (Current)

```bash
# Backend is working
cd plugins/x2a-backend
yarn start

# Test endpoints
curl http://localhost:7007/x2a/health
curl http://localhost:7007/x2a/context
curl http://localhost:7007/x2a/pods/tamaod
```

### Production Testing (After Implementation)

1. **Deploy to test cluster**
2. **Verify in-cluster auth**: Check logs show "Loaded in-cluster configuration"
3. **Test impersonation**: Create test user, verify API calls work
4. **Check audit logs**: Verify K8s audit shows user identity
5. **Test authorization**: User without RBAC should get 403

## References

### Code Patterns From Other Plugins

**Lightspeed plugin** (`lightspeed-backend/src/service/router.ts:80-82`):
```typescript
const credentials = await httpAuth.credentials(req);
const user = await userInfo.getUserInfo(credentials);
const userEntity = user.userEntityRef;
```

**Orchestrator plugin** (`orchestrator-backend/src/service/router.ts:82`):
```typescript
const credentials = await httpAuth.credentials(request);
```

**Bulk-import plugin** (`bulk-import-backend/src/helpers/auth.ts:51`):
```typescript
credentials: await httpAuth.credentials(req)
```

### Kubernetes Documentation

- [User Impersonation](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#user-impersonation)
- [ServiceAccount Tokens](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)
- [RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

## Timeline

- **Phase 1 (Code)**: 2-3 hours
- **Phase 2 (RBAC manifests)**: 1 hour
- **Phase 3 (Documentation)**: 2 hours
- **Testing**: 2-3 hours

**Total Effort**: ~1 day

## Decision Record

**Date**: 2026-01-13
**Decision**: Use ServiceAccount + Impersonation approach
**Rationale**:
- Standard pattern in RHDH plugins
- Satisfies per-user audit requirement
- Works for in-cluster deployment
- No OIDC complexity
- Simple to implement and understand

**Alternatives Considered**:
1. OIDC tokens - More complex, requires cluster OIDC setup
2. Shared ServiceAccount - No per-user audit (rejected)
3. Config-based credentials - File management burden (rejected)

## Questions & Answers

**Q: How do credentials get into the pod?**
A: Kubernetes automatically mounts ServiceAccount token at `/var/run/secrets/kubernetes.io/serviceaccount/token`

**Q: Does the plugin need kubeconfig file in production?**
A: No, `loadFromCluster()` reads the auto-mounted token

**Q: How does ServiceAccount in rhdh namespace access x2a namespace?**
A: RoleBinding in x2a namespace references ServiceAccount from rhdh namespace

**Q: What if RHDH uses different ServiceAccount name?**
A: User edits rbac.yaml before applying (we provide clear instructions)

**Q: How are users mapped to Kubernetes?**
A: User's Backstage userEntityRef becomes K8s User identity via impersonation header

**Q: Can we test this locally?**
A: Yes, code detects in-cluster mode, falls back to kubeconfig for development

## Status

**Current State**: Development PoC using local kubeconfig
**Next Step**: Continue PoC work
**Future**: Implement this plan when ready for production deployment
