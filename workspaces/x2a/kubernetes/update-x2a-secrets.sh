#!/bin/bash
# Helper script to update X2A secrets with actual credentials
# Usage: ./update-x2a-secrets.sh

set -e

echo "X2A Secrets Update Script"
echo "=========================="
echo ""
echo "This script will update the x2a-secrets in the rhdh namespace."
echo ""

# Set KUBECONFIG if needed
if [ -z "$KUBECONFIG" ]; then
  if [ -f "$HOME/.kube/kubeconfig" ]; then
    export KUBECONFIG="$HOME/.kube/kubeconfig"
    echo "Using KUBECONFIG: $KUBECONFIG"
  fi
fi

# Prompt for credentials
echo ""
echo "LLM Configuration:"
read -p "LLM Model [meta/llama-3.3-70b-instruct-maas]: " LLM_MODEL
LLM_MODEL=${LLM_MODEL:-"meta/llama-3.3-70b-instruct-maas"}

read -p "OpenAI API Base [https://us-central1-aiplatform.googleapis.com/v1/projects/rhdh-orchestrator-ai/locations/us-central1/endpoints/openapi]: " OPENAI_API_BASE
OPENAI_API_BASE=${OPENAI_API_BASE:-"https://us-central1-aiplatform.googleapis.com/v1/projects/rhdh-orchestrator-ai/locations/us-central1/endpoints/openapi"}

read -p "VertexAI Project [rhdh-orchestrator-ai]: " VERTEXAI_PROJECT
VERTEXAI_PROJECT=${VERTEXAI_PROJECT:-"rhdh-orchestrator-ai"}

echo ""
echo "GitHub Configuration:"
read -p "GitHub Token (optional, press Enter to skip): " GITHUB_TOKEN

echo ""
echo "Git Identity Configuration:"
read -p "Git Author Name [X2A Convertor Bot]: " GIT_AUTHOR_NAME
GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME:-"X2A Convertor Bot"}

read -p "Git Author Email [eshalev@redhat.com]: " GIT_AUTHOR_EMAIL
GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL:-"eshalev@redhat.com"}

echo ""
echo "AAP Configuration:"
read -p "AAP Controller URL [https://aap-aap.apps.cluster-fw6zz-1.dynamic.redhatworkshops.io/]: " AAP_URL
AAP_URL=${AAP_URL:-"https://aap-aap.apps.cluster-fw6zz-1.dynamic.redhatworkshops.io/"}

read -p "AAP Organization Name [Default]: " AAP_ORG
AAP_ORG=${AAP_ORG:-"Default"}

read -p "AAP Username [admin]: " AAP_USERNAME
AAP_USERNAME=${AAP_USERNAME:-"admin"}

read -sp "AAP Password: " AAP_PASSWORD
echo ""

read -p "AAP Verify SSL [true]: " AAP_VERIFY_SSL
AAP_VERIFY_SSL=${AAP_VERIFY_SSL:-"true"}

# Confirm
echo ""
echo "You entered:"
echo "  LLM Model: $LLM_MODEL"
echo "  OpenAI API Base: $OPENAI_API_BASE"
echo "  VertexAI Project: $VERTEXAI_PROJECT"
echo "  GitHub Token: ${GITHUB_TOKEN:+configured}"
echo "  Git Author Name: $GIT_AUTHOR_NAME"
echo "  Git Author Email: $GIT_AUTHOR_EMAIL"
echo "  AAP URL: $AAP_URL"
echo "  AAP Org: $AAP_ORG"
echo "  AAP Username: $AAP_USERNAME"
echo "  AAP Password: ${AAP_PASSWORD:0:5}..."
echo ""
read -p "Update the secret? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
  echo "Aborted."
  exit 1
fi

# Delete existing secret
echo "Deleting existing secret..."
kubectl delete secret x2a-secrets -n rhdh --ignore-not-found

# Create new secret
echo "Creating new secret..."
kubectl create secret generic x2a-secrets -n rhdh \
  --from-literal=llm-model="$LLM_MODEL" \
  --from-literal=openai-api-base="$OPENAI_API_BASE" \
  --from-literal=vertexai-project="$VERTEXAI_PROJECT" \
  --from-literal=log-level="DEBUG" \
  --from-literal=langchain-debug="FALSE" \
  --from-literal=recursion-limit="900" \
  --from-literal=max-export-attempts="80" \
  --from-literal=github-token="${GITHUB_TOKEN}" \
  --from-literal=git-author-name="$GIT_AUTHOR_NAME" \
  --from-literal=git-author-email="$GIT_AUTHOR_EMAIL" \
  --from-literal=aap-controller-url="$AAP_URL" \
  --from-literal=aap-org-name="$AAP_ORG" \
  --from-literal=aap-username="$AAP_USERNAME" \
  --from-literal=aap-password="$AAP_PASSWORD" \
  --from-literal=aap-oauth-token="" \
  --from-literal=aap-ca-bundle="" \
  --from-literal=aap-verify-ssl="$AAP_VERIFY_SSL"

echo ""
echo "✓ Secret updated successfully!"
echo ""
echo "You can now create jobs that will use these credentials."
