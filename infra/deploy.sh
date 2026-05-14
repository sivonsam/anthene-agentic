#!/bin/bash
# Deploy Anthene Light Agentic infrastructure
set -e

RESOURCE_GROUP="anthene-agentic-rg"
LOCATION="swedencentral"

echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

echo "Deploying infrastructure..."
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file anthene-agentic.bicep \
  --parameters location=$LOCATION \
  --output json | tee deployment-output.json

echo "Done! See deployment-output.json for details."
