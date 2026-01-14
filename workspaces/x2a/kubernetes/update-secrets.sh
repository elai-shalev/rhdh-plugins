#!/bin/bash
# Helper script to update X2A secrets with actual credentials
# Usage: ./update-secrets.sh

set -e

echo "X2A Secrets Update Script"
echo "========================="
echo ""
echo "This script will help you update the x2a-secrets with your credentials."
echo ""

# Prompt for AWS credentials
read -p "Enter AWS Region (e.g., us-east-1): " AWS_REGION
read -sp "Enter AWS Bearer Token for Bedrock: " AWS_TOKEN
echo ""
read -p "Enter GitHub Token (optional, press Enter to skip): " GITHUB_TOKEN
echo ""

# Confirm
echo ""
echo "You entered:"
echo "  AWS Region: $AWS_REGION"
echo "  AWS Token: ${AWS_TOKEN:0:10}... (hidden)"
if [ -n "$GITHUB_TOKEN" ]; then
  echo "  GitHub Token: ${GITHUB_TOKEN:0:10}... (hidden)"
fi
echo ""
read -p "Update the secret? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
  echo "Aborted."
  exit 1
fi

# Set KUBECONFIG if needed
if [ -z "$KUBECONFIG" ]; then
  if [ -f "$HOME/.kube/kubeconfig" ]; then
    export KUBECONFIG="$HOME/.kube/kubeconfig"
    echo "Using KUBECONFIG: $KUBECONFIG"
  fi
fi

# Delete existing secret
echo "Deleting existing secret..."
kubectl delete secret x2a-secrets -n x2a --ignore-not-found

# Create new secret
echo "Creating new secret..."
if [ -n "$GITHUB_TOKEN" ]; then
  kubectl create secret generic x2a-secrets -n x2a \
    --from-literal=aws-region="$AWS_REGION" \
    --from-literal=aws-bearer-token="$AWS_TOKEN" \
    --from-literal=github-token="$GITHUB_TOKEN"
else
  kubectl create secret generic x2a-secrets -n x2a \
    --from-literal=aws-region="$AWS_REGION" \
    --from-literal=aws-bearer-token="$AWS_TOKEN"
fi

echo ""
echo "✓ Secret updated successfully!"
echo ""
echo "You can now create jobs that will use these credentials."
