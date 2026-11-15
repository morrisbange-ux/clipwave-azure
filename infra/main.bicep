// =====================================================================
// ClipWave - application infrastructure (all free-tier friendly)
//
//  Log Analytics + Application Insights  -> monitoring
//  Storage account (Blob)                -> video files
//  Cosmos DB (NoSQL, free tier)          -> users, videos, likes, comments
//  Container Apps environment            -> serverless containers
//    - clipwave-staging  (single revision)
//    - clipwave-prod     (multiple revisions -> canary / blue-green)
// =====================================================================
targetScope = 'resourceGroup'

param location string = resourceGroup().location
param appName string = 'clipwave'

@description('Container image to run. The CI/CD pipeline replaces this on every release.')
param containerImage string = 'ghcr.io/morrisbange-ux/clipwave-azure:latest'

@description('Only ONE Cosmos DB free-tier account is allowed per subscription. Set false to use serverless instead.')
param enableCosmosFreeTier bool = true

@secure()
@description('Secret used to sign login tokens (JWT).')
param jwtSecret string

@description('Max replicas production may scale out to.')
param prodMaxReplicas int = 10

var suffix = uniqueString(resourceGroup().id)
var storageName = toLower('st${appName}${take(suffix, 10)}')
var cosmosName = toLower('cosmos-${appName}-${take(suffix, 8)}')

// ---------------- Monitoring ----------------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${appName}-${take(suffix, 6)}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.15') } // stays inside the 5 GB/month free allowance
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${appName}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ---------------- Container Apps environment ----------------
resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${appName}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
  }
}

var stagingName = '${appName}-staging'
var prodName = '${appName}-prod'
var stagingOrigin = 'https://${stagingName}.${env.properties.defaultDomain}'
var prodOrigin = 'https://${prodName}.${env.properties.defaultDomain}'

// ---------------- Blob Storage ----------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false // videos are only reachable through time-limited SAS URLs
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      corsRules: [{
        allowedOrigins: [stagingOrigin, prodOrigin, 'http://localhost:3000']
        allowedMethods: ['GET', 'HEAD', 'PUT', 'OPTIONS']
        allowedHeaders: ['*']
        exposedHeaders: ['*']
        maxAgeInSeconds: 3600
      }]
    }
    deleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource videosContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'videos'
  properties: { publicAccess: 'None' }
}

resource stagingVideosContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'videos-staging'
  properties: { publicAccess: 'None' }
}

var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

// ---------------- Cosmos DB ----------------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableCosmosFreeTier
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [{ locationName: location, failoverPriority: 0, isZoneRedundant: false }]
    capabilities: enableCosmosFreeTier ? [] : [{ name: 'EnableServerless' }]
    minimalTlsVersion: 'Tls12'
  }
}

// Shared database throughput: every container (prod + staging) shares the
// 1000 RU/s that the free tier gives at no cost.
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: appName
  properties: {
    resource: { id: appName }
    options: enableCosmosFreeTier ? { throughput: 1000 } : {}
  }
}

// ---------------- Container Apps ----------------
var commonSecrets = [
  { name: 'storage-connection', value: storageConnection }
  { name: 'cosmos-key', value: cosmos.listKeys().primaryMasterKey }
  { name: 'jwt-secret', value: jwtSecret }
  { name: 'appinsights-connection', value: appInsights.properties.ConnectionString }
]

func appEnv(environmentName string, containerPrefix string, blobContainer string, endpoint string) array => [
  { name: 'PORT', value: '3000' }
  { name: 'APP_ENVIRONMENT', value: environmentName }
  { name: 'COSMOS_ENDPOINT', value: endpoint }
  { name: 'COSMOS_KEY', secretRef: 'cosmos-key' }
  { name: 'COSMOS_DATABASE', value: 'clipwave' }
  { name: 'COSMOS_CONTAINER_PREFIX', value: containerPrefix }
  { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-connection' }
  { name: 'STORAGE_CONTAINER', value: blobContainer }
  { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection' }
]

var probes = [
  { type: 'Liveness', httpGet: { path: '/healthz', port: 3000 }, periodSeconds: 30, initialDelaySeconds: 5 }
  { type: 'Readiness', httpGet: { path: '/readyz', port: 3000 }, periodSeconds: 15, initialDelaySeconds: 3 }
]

resource staging 'Microsoft.App/containerApps@2024-03-01' = {
  name: stagingName
  location: location
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      secrets: commonSecrets
    }
    template: {
      containers: [{
        name: 'api'
        image: containerImage
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: appEnv('staging', 'stg-', 'videos-staging', cosmos.properties.documentEndpoint)
        probes: probes
      }]
      scale: { minReplicas: 0, maxReplicas: 2 } // scale to zero = no cost when idle
    }
  }
  dependsOn: [cosmosDb, stagingVideosContainer]
}

resource prod 'Microsoft.App/containerApps@2024-03-01' = {
  name: prodName
  location: location
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      // Multiple revisions can run side by side; the pipeline splits traffic
      // between them for canary releases and instant rollback.
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        traffic: [{ latestRevision: true, weight: 100 }]
      }
      secrets: commonSecrets
    }
    template: {
      containers: [{
        name: 'api'
        image: containerImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: appEnv('production', '', 'videos', cosmos.properties.documentEndpoint)
        probes: probes
      }]
      scale: {
        minReplicas: 0
        maxReplicas: prodMaxReplicas
        rules: [{ name: 'http-scaling', http: { metadata: { concurrentRequests: '30' } } }]
      }
    }
  }
  dependsOn: [cosmosDb, videosContainer]
}

output stagingUrl string = 'https://${staging.properties.configuration.ingress.fqdn}'
output productionUrl string = 'https://${prod.properties.configuration.ingress.fqdn}'
output storageAccount string = storage.name
output cosmosAccount string = cosmos.name
output appInsightsName string = appInsights.name
