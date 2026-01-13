---
'@red-hat-developer-hub/backstage-plugin-x2a': minor
'@red-hat-developer-hub/backstage-plugin-x2a-backend': minor
'@red-hat-developer-hub/backstage-plugin-x2a-common': minor
---

Initial release of X2A plugins for Kubernetes integration.

- **x2a-backend**: Backend plugin providing REST API endpoints for Kubernetes cluster access
  - GET /api/x2a/health - Health check endpoint
  - GET /api/x2a/context - Get current Kubernetes context
  - GET /api/x2a/pods/:namespace - List pods in a namespace
- **x2a**: Frontend plugin with basic UI components
- **x2a-common**: Shared types and interfaces between frontend and backend
