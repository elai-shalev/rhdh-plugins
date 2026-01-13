# X2A Workspace

This workspace contains plugins for Kubernetes cluster integration.

## Plugins

- `@red-hat-developer-hub/backstage-plugin-x2a` - Frontend plugin for displaying Kubernetes resources
- `@red-hat-developer-hub/backstage-plugin-x2a-backend` - Backend plugin providing REST API for Kubernetes cluster access
- `@red-hat-developer-hub/backstage-plugin-x2a-common` - Shared types and utilities

## Getting Started

To start developing:

```sh
yarn install
cd plugins/x2a-backend
yarn start
```

This will start the backend plugin with a standalone development server.

## Features

- List pods in a Kubernetes namespace via REST API
- Integration with Backstage Kubernetes plugin
- Extensible architecture for adding more Kubernetes operations

## Configuration

The plugin requires Kubernetes cluster configuration. Add the following to your `app-config.yaml`:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: 'multiTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - name: local-cluster
          url: ${K8S_CLUSTER_URL}
          authProvider: 'serviceAccount'
```

## API Endpoints

- `GET /api/x2a/pods/:namespace` - List all pods in the specified namespace
