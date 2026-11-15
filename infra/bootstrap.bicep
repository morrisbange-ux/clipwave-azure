// =====================================================================
// ONE-OFF bootstrap: run this yourself once (you need Owner on the
// resource group). It creates a managed identity that GitHub Actions
// signs in as using OpenID Connect - no passwords or secrets stored in
// GitHub - and gives it Contributor on this resource group only.
// =====================================================================
@description('GitHub repository in the form owner/name')
param githubRepo string

param location string = resourceGroup().location
param identityName string = 'id-clipwave-github'

var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'
// One federated credential per GitHub "subject" that is allowed to log in.
var subjects = {
  main: 'repo:${githubRepo}:ref:refs/heads/main'
  staging: 'repo:${githubRepo}:environment:staging'
  production: 'repo:${githubRepo}:environment:production'
  promote: 'repo:${githubRepo}:environment:production-promote'
  pr: 'repo:${githubRepo}:pull_request'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

@batchSize(1) // federated credentials on one identity must be created sequentially
resource fic 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = [for s in items(subjects): {
  parent: identity
  name: 'github-${s.key}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: s.value
    audiences: ['api://AzureADTokenExchange']
  }
}]

resource contributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, contributorRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
  }
}

output AZURE_CLIENT_ID string = identity.properties.clientId
output AZURE_TENANT_ID string = subscription().tenantId
output AZURE_SUBSCRIPTION_ID string = subscription().subscriptionId
