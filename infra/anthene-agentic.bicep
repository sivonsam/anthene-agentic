// ============================================================
// Anthene Light Agentic — Infrastructure
// Completely separate environment from Anthene Light
// ============================================================

@description('Azure region for all resources')
param location string = 'swedencentral'

@description('Prefix used for all resource names')
param prefix string = 'anthene-agentic'

@description('Environment tag')
param environment string = 'prod'

// ACR name must be alphanumeric only (no hyphens)
var acrName = toLower(replace(prefix, '-', ''))

// ============================================================
// Log Analytics Workspace (for Container Apps environment)
// ============================================================
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  tags: { environment: environment }
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ============================================================
// Azure Container Registry
// ============================================================
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: { environment: environment }
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ============================================================
// Azure Cosmos DB — Serverless
// ============================================================
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: '${prefix}-cosmos'
  location: location
  tags: { environment: environment }
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: 'anthene-agentic-db'
  properties: {
    resource: {
      id: 'anthene-agentic-db'
    }
  }
}

resource containerAgents 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: cosmosDatabase
  name: 'agents'
  properties: {
    resource: {
      id: 'agents'
      partitionKey: {
        paths: ['/owner_id']
        kind: 'Hash'
      }
    }
  }
}

resource containerAgentRuns 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: cosmosDatabase
  name: 'agent_runs'
  properties: {
    resource: {
      id: 'agent_runs'
      partitionKey: {
        paths: ['/agent_id']
        kind: 'Hash'
      }
    }
  }
}

resource containerUsers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
    }
  }
}

// ============================================================
// Azure Container Apps Environment
// ============================================================
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  tags: { environment: environment }
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ============================================================
// Azure Key Vault — RBAC-based (no access policies)
// ============================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${prefix}-kv'
  location: location
  tags: { environment: environment }
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
  }
}

// ============================================================
// Static Web Apps (Free SKU) — must use westeurope (not swedencentral)
// ============================================================
var swaLocation = 'westeurope'

resource swaCreator 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-creator'
  location: swaLocation
  tags: { environment: environment, app: 'agent-creator-ui' }
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

resource swaProphet 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-prophet'
  location: swaLocation
  tags: { environment: environment, app: 'agent-prophet-ui' }
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

resource swaStore 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-store'
  location: swaLocation
  tags: { environment: environment, app: 'agentstore-ui' }
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

// ============================================================
// Azure AI Services (OpenAI)
// Note: AI Foundry project is created via portal after this deploys.
// This resource provides the OpenAI endpoint used by Foundry.
// ============================================================
resource aiServices 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: '${prefix}-aiservices'
  location: location
  tags: { environment: environment }
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    customSubDomainName: '${prefix}-aiservices'
  }
}

// ============================================================
// Outputs
// ============================================================
@description('Container Registry login server')
output acrLoginServer string = acr.properties.loginServer

@description('Container Registry name')
output acrName string = acr.name

@description('Cosmos DB endpoint')
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint

@description('Cosmos DB primary key')
@secure()
output cosmosPrimaryKey string = cosmosAccount.listKeys().primaryMasterKey

@description('Key Vault URI')
output keyVaultUri string = keyVault.properties.vaultUri

@description('Agent Creator SWA deployment token')
@secure()
output creatorDeploymentToken string = swaCreator.listSecrets().properties.apiKey

@description('Agent Prophet SWA deployment token')
@secure()
output prophetDeploymentToken string = swaProphet.listSecrets().properties.apiKey

@description('AgentStore SWA deployment token')
@secure()
output storeDeploymentToken string = swaStore.listSecrets().properties.apiKey

@description('Container Apps environment name')
output containerAppsEnvName string = containerAppsEnv.name

@description('AI Services endpoint')
output aiServicesEndpoint string = aiServices.properties.endpoint
