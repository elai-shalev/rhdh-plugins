# @red-hat-developer-hub/backstage-plugin-x2a

Frontend plugin for the X2A Kubernetes integration.

## Installation

```bash
yarn add @red-hat-developer-hub/backstage-plugin-x2a
```

## Usage

Add the plugin page to your app:

```tsx
// In packages/app/src/App.tsx
import { X2APage } from '@red-hat-developer-hub/backstage-plugin-x2a';

// In your routes
<Route path="/x2a" element={<X2APage />} />
```

## Development

To start the development server:

```bash
yarn start
```
