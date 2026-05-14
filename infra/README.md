# Anthene Light Agentic — Infrastructure

> **Completely separate environment** from Anthene Light.

## Resource Group

| Setting | Value |
|---|---|
| Resource Group | `anthene-agentic-rg` |
| Location | `swedencentral` |

---

## How to Deploy

### Prerequisites
- Azure CLI installed and logged in (`az login`)
- Bicep CLI: `az bicep install`

### Deploy

```bash
cd /path/to/infra
chmod +x deploy.sh
./deploy.sh
```

Or manually:

```bash
az group create --name anthene-agentic-rg --location swedencentral

az deployment group create \
  --resource-group anthene-agentic-rg \
  --template-file anthene-agentic.bicep \
  --parameters location=swedencentral \
  --output json | tee deployment-output.json
```

---

## How to Get Secrets After Deploy

All sensitive outputs (Cosmos key, SWA tokens, etc.) are marked `@secure()` and won't appear in the portal deployment history. Retrieve them via CLI:

```bash
# Cosmos DB primary key
az deployment group show \
  --resource-group anthene-agentic-rg \
  --name anthene-agentic \
  --query properties.outputs.cosmosPrimaryKey.value -o tsv

# Agent Creator SWA deployment token
az deployment group show \
  --resource-group anthene-agentic-rg \
  --name anthene-agentic \
  --query properties.outputs.creatorDeploymentToken.value -o tsv

# Agent Prophet SWA deployment token
az deployment group show \
  --resource-group anthene-agentic-rg \
  --name anthene-agentic \
  --query properties.outputs.prophetDeploymentToken.value -o tsv

# AgentStore SWA deployment token
az deployment group show \
  --resource-group anthene-agentic-rg \
  --name anthene-agentic \
  --query properties.outputs.storeDeploymentToken.value -o tsv
```

Or directly from the resources:

```bash
# Cosmos DB key
az cosmosdb keys list \
  --name anthene-agentic-cosmos \
  --resource-group anthene-agentic-rg \
  --query primaryMasterKey -o tsv

# SWA deployment token (replace <swa-name> with creator/prophet/store)
az staticwebapp secrets list \
  --name anthene-agentic-creator \
  --query properties.apiKey -o tsv
```

---

## Resources Deployed

| Resource | Name | Notes |
|---|---|---|
| Container Registry | `antheneagenticacr` | Basic SKU, admin enabled |
| Cosmos DB Account | `anthene-agentic-cosmos` | Serverless |
| Cosmos DB Database | `anthene-agentic-db` | — |
| Cosmos Container | `agents` | partition: `/owner_id` |
| Cosmos Container | `agent_runs` | partition: `/agent_id` |
| Cosmos Container | `users` | partition: `/id` |
| Container Apps Env | `anthene-agentic-env` | Linked to Log Analytics |
| Log Analytics | `anthene-agentic-logs` | 30-day retention |
| Key Vault | `anthene-agentic-kv` | RBAC auth, soft-delete 90d |
| Static Web App | `anthene-agentic-creator` | Agent Creator UI |
| Static Web App | `anthene-agentic-prophet` | Agent Prophet UI |
| Static Web App | `anthene-agentic-store` | AgentStore UI |
| AI Services | `anthene-agentic-aiservices` | OpenAI kind, S0 SKU |

---

## Cost Estimate (Sweden Central, prod)

| Resource | SKU | Est. Monthly Cost |
|---|---|---|
| Container Registry | Basic | ~$5 |
| Cosmos DB | Serverless | ~$0–10 (usage-based) |
| Container Apps Environment | Consumption | ~$0 (pay-per-use) |
| Log Analytics | Pay-per-GB | ~$2–5 |
| Key Vault | Standard | ~$1 |
| Static Web Apps × 3 | Free | $0 |
| AI Services (OpenAI) | S0 | Pay-per-token |
| **Total (excl. OpenAI tokens)** | | **~$8–21/mo** |

> OpenAI costs depend entirely on model usage. GPT-4o input ~$5/1M tokens, output ~$15/1M tokens.

---

## Post-Deploy: AI Foundry

The `anthene-agentic-aiservices` resource provides the OpenAI endpoint.  
Create the **AI Foundry project** via the Azure Portal → AI Foundry → link to this Cognitive Services account.

---

## Notes

- Key Vault uses **RBAC authorization** — assign `Key Vault Secrets Officer` role to principals that need secret access.
- Container Apps are not pre-deployed; push images to the ACR and create Container Apps as needed.
- Static Web Apps are connected to repos via GitHub Actions using the deployment tokens.
