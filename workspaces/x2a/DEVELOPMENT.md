# X2A Development Guide

## Current Status

The X2A workspace includes:
- **x2a-backend**: Backend plugin with Kubernetes API integration ✅
- **x2a**: Frontend plugin with basic UI ✅
- **x2a-common**: Shared types ✅
- **packages/app**: Frontend dev environment ✅
- **packages/backend**: Backend dev environment ⚠️ (version compatibility issues)

## Running the Plugin

### Option 1: Standalone Backend Plugin (RECOMMENDED - VERIFIED WORKING ✅)

The standalone backend server has been tested and is working correctly. This is the simplest way to develop and test your Kubernetes API:

```bash
cd plugins/x2a-backend
yarn start
```

This starts your x2a-backend plugin on **http://localhost:7007**

**Test the API:**
```bash
# Health check
curl http://localhost:7007/x2a/health

# Get Kubernetes context
curl http://localhost:7007/x2a/context

# List pods in a namespace
curl http://localhost:7007/x2a/pods/tamaod
curl http://localhost:7007/x2a/pods/default
curl http://localhost:7007/x2a/pods/kube-system

# Pretty-print JSON output
curl -s http://localhost:7007/x2a/pods/tamaod | jq .
```

**Example Response:**
```json
{
  "pods": [
    {
      "name": "tamaod-5d78c46559-4rrjj",
      "namespace": "tamaod",
      "status": "Running",
      "createdAt": "2026-01-13T00:00:03.000Z",
      "labels": {
        "app": "tamaod",
        "version": "v1"
      },
      "containerCount": 1
    }
  ],
  "namespace": "tamaod",
  "total": 1
}
```

### Option 2: Full Backstage App (Has Version Issues)

There are Backstage package version compatibility issues between `@backstage/backend-defaults@0.13.1` and `@backstage/backend-plugin-api@1.6.0`.

**Error seen:**
```
TypeError: Cannot read properties of undefined (reading 'scope')
at Object.createServiceFactory
```

**To fix this (when you have time):**
1. All Backstage packages need to be from the same release
2. Consider upgrading/downgrading all packages to a single compatible version set
3. Or use the orchestrator workspace's exact versions

## Development Workflow

### Making Changes to the Backend

1. Edit code in `plugins/x2a-backend/src/`
2. The dev server will automatically reload
3. Test your endpoints with curl

### Example: Adding a New Endpoint

Edit `plugins/x2a-backend/src/service/router.ts`:

```typescript
// List deployments in a namespace
router.get('/deployments/:namespace', async (request, response) => {
  const { namespace } = request.params;
  // Add your logic here
});
```

### Kubernetes Configuration

The plugin automatically loads Kubernetes config from:
1. `$KUBECONFIG` environment variable (if set)
2. `~/.kube/kubeconfig` file (automatically detected)
3. `~/.kube/config` file (fallback)
4. In-cluster configuration (when running in a pod)

**No manual configuration needed!** The plugin automatically detects `~/.kube/kubeconfig` and sets it as the KUBECONFIG path.

If you need to use a different kubeconfig:
```bash
export KUBECONFIG=/path/to/your/kubeconfig
cd plugins/x2a-backend
yarn start
```

## File Structure

```
workspaces/x2a/
├── plugins/
│   ├── x2a-backend/              # Your main backend plugin
│   │   ├── src/
│   │   │   ├── service/
│   │   │   │   ├── router.ts           # API endpoints
│   │   │   │   └── KubernetesService.ts # K8s client wrapper
│   │   │   ├── plugin.ts               # Backstage plugin registration
│   │   │   └── index.ts
│   │   └── package.json
│   ├── x2a/                      # Frontend plugin
│   └── x2a-common/               # Shared types
├── packages/
│   ├── app/                      # Frontend dev app (working)
│   └── backend/                  # Backend dev app (version issues)
└── app-config.yaml               # Development configuration
```

## Next Steps

1. **Test your current backend**: Use the standalone mode (Option 1 above)
2. **Extend the API**: Add more Kubernetes operations (deployments, services, nodes)
3. **Build the frontend**: Create React components to display pod data
4. **Fix backend compatibility**: Align all Backstage package versions when time permits

## Known Issues

- **Backend version compatibility**: The full Backstage backend (packages/backend) has package version conflicts
- **Workaround**: Use standalone plugin mode for development

## Useful Commands

```bash
# Install dependencies
yarn install

# Type check
yarn tsc

# Lint code
yarn lint:all

# Build all packages
yarn build:all

# Run tests
yarn test:all
```
