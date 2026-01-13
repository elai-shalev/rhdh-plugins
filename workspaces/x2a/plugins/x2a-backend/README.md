# @red-hat-developer-hub/backstage-plugin-x2a-backend

Backend plugin for the X2A Kubernetes integration. Provides REST API endpoints for querying Kubernetes clusters.

## Installation

Install the plugin:

```bash
yarn add @red-hat-developer-hub/backstage-plugin-x2a-backend
```

## Configuration

The plugin uses the Kubernetes client library which automatically loads configuration from:
1. `KUBECONFIG` environment variable
2. `~/.kube/config` file
3. In-cluster configuration (when running in a pod)

No additional configuration is required in `app-config.yaml` for basic usage.

## Integration

Add the plugin to your backend in `packages/backend/src/index.ts`:

```typescript
backend.add(import('@red-hat-developer-hub/backstage-plugin-x2a-backend'));
```

## API Endpoints

- `GET /api/x2a/health` - Health check endpoint
- `GET /api/x2a/context` - Get current Kubernetes context
- `GET /api/x2a/pods/:namespace` - List all pods in the specified namespace

### Example: List pods

```bash
curl http://localhost:7007/api/x2a/pods/default
```

Response:
```json
{
  "pods": [
    {
      "name": "my-pod",
      "namespace": "default",
      "status": "Running",
      "createdAt": "2024-01-13T10:00:00Z",
      "containerCount": 1,
      "labels": {
        "app": "my-app"
      }
    }
  ],
  "namespace": "default",
  "total": 1
}
```

## Development

To start the standalone development server:

```bash
yarn start
```

This will start the backend on http://localhost:7007
