# ClipWave: a cloud-native short-video app on Azure

ClipWave is a TikTok-style web app where users sign up, upload short videos, scroll a vertical feed, like and comment. It runs on **Azure Container Apps**, using **Blob Storage**, **Cosmos DB** and **Application Insights**. A **GitHub Actions** pipeline tests it, builds it and deploys it through staging, then a production **canary release** with automatic rollback.

Everything is designed to fit inside **Azure free tiers / Azure for Students credit**.

## Architecture

```
            Browser (vanilla JS SPA)
              │  HTTPS                     ▲ ▼  direct upload/playback with SAS URLs
              ▼                            │ │  (valet-key pattern, video never hits the API)
   ┌─────────────────────────────┐   ┌─────┴─┴──────────────┐
   │ Azure Container Apps env    │   │ Azure Blob Storage   │
   │  clipwave-staging (single)  │──▶│  videos / videos-stg │
   │  clipwave-prod  (multi-rev) │   └──────────────────────┘
   │    rev A 90% │ rev B 10%    │   ┌──────────────────────┐
   │  autoscale 0..10 (HTTP)     │──▶│ Azure Cosmos DB      │
   └──────────────┬──────────────┘   │ (free tier 1000RU/s) │
                  │ telemetry        └──────────────────────┘
                  ▼
   Application Insights + Log Analytics
```

| Concern | Choice | Why |
|---|---|---|
| Compute | Azure Container Apps (Consumption) | Serverless containers, scale-to-zero, HTTP autoscaling, **revision traffic splitting** for canary/blue-green |
| Video files | Blob Storage + SAS | Cheap object storage; browser uploads directly, so the API stays stateless and small |
| Metadata | Cosmos DB NoSQL (free tier) | Elastic, partitioned NoSQL; free 1000 RU/s + 25 GB |
| Monitoring | Application Insights | Request/dependency tracing, failures, live metrics |
| Registry | GitHub Container Registry | Free, no ACR cost |
| CI/CD | GitHub Actions + OIDC | No stored cloud passwords; environments with approval gates |
| IaC | Bicep | Whole environment reproducible from `infra/main.bicep` |

## Run it locally (no Azure needed)

Requirements: **Node.js 22**.

```bash
npm install
npm start
```

Open http://localhost:3000. Without Azure settings the app uses an in-memory database and saves videos to `./uploads`. To point it at real Azure resources, copy `.env.example` to `.env` and fill in the values.

### Tests

```bash
npm run lint          # ESLint
npm test              # Jest unit + API integration tests with coverage gate (70%)
npx playwright install chromium
npm run test:e2e      # Playwright browser test: sign up -> upload -> like -> comment
```

## Deploy to Azure: step by step (Windows PowerShell)

Install the [Azure CLI](https://aka.ms/installazurecliwindows), then:

**1. Let the pipeline build the first image.** Every push to `main` runs the tests and pushes an image to GitHub Container Registry. When the first run finishes, go to your GitHub profile → **Packages → clipwave-azure → Package settings → Change visibility → Public**. Azure can then pull the image without a password.

**2. Sign in and create a resource group**

```powershell
az login
az provider register -n Microsoft.App
az provider register -n Microsoft.OperationalInsights
az provider register -n Microsoft.DocumentDB
az group create -n rg-clipwave -l uksouth
```

> If your Azure for Students subscription refuses a region (policy error), try `northeurope`, `westeurope` or `swedencentral`.

**3. Create the GitHub sign-in identity (one-off)**

```powershell
az deployment group create -g rg-clipwave --template-file infra/bootstrap.bicep --parameters githubRepo=morrisbange-ux/clipwave-azure --query properties.outputs
```

Note the three values it prints: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

**4. Deploy the app infrastructure**

```powershell
$jwt = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
$jwt   # copy this, you need it in step 5
az deployment group create -g rg-clipwave --template-file infra/main.bicep --parameters infra/main.parameters.json --parameters jwtSecret=$jwt --query properties.outputs
```

This takes about 5–10 minutes and prints `stagingUrl` and `productionUrl`.
> Only one Cosmos DB free-tier account is allowed per subscription. If you already have one, add `enableCosmosFreeTier=false` to the command, which uses serverless instead (pay-per-request, a few pence).

**5. Configure GitHub** (repo → **Settings**)

- *Secrets and variables → Actions → Secrets*: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `JWT_SECRET`
- *Secrets and variables → Actions → Variables*: `AZURE_DEPLOY_ENABLED` = `true`, `AZURE_RESOURCE_GROUP` = `rg-clipwave`
- *Environments*: create `staging`, `production` and `production-promote`. On `production` and `production-promote`, tick **Required reviewers** and add yourself. These are the manual approval gates.

**6. Ship a change.** Edit something (e.g. a colour in `public/styles.css`), commit and push. In the **Actions** tab you will see:

`Lint & test → Build & scan image → Deploy to staging → (approve) Production canary 10% → (approve) Promote to 100%`

The version badge at the bottom-left of the app shows which revision served you. During the canary, refresh a few times to see both versions.

### Other workflows

- **Rollback production** (Actions → Rollback production → Run): instantly routes 100% of traffic back to the previous revision.
- **Load test** (Actions → Load test → Run, paste a URL): k6 ramps to 50 virtual users. Watch replicas scale out in *Azure portal → clipwave-prod → Metrics → Replica count*.
- **Infrastructure**: what-if preview of Bicep changes on pull requests; manual deploy.

### Clean up (avoid charges after marking)

```powershell
az group delete -n rg-clipwave --yes
```

## Free-tier usage limits

| Service | Free allowance | ClipWave usage |
|---|---|---|
| Container Apps | 180,000 vCPU-s, 360,000 GiB-s, 2M requests per month | Scale-to-zero, so idle costs nothing |
| Cosmos DB free tier | 1000 RU/s + 25 GB (one account per subscription) | Shared database throughput across all containers |
| Blob Storage | 5 GB LRS for 12 months (free account); pennies otherwise | 100 MB max per video |
| Log Analytics | 5 GB ingestion per month | Daily cap 0.15 GB |
| GitHub Actions | Unlimited for public repos | — |
| GitHub Container Registry | Free for public images | — |

Check current limits on the Azure pricing pages, because they change.

## Project structure

```
src/            Express API (app.js), data layer (db/), storage layer (storage/)
public/         Frontend (HTML/CSS/JS, no build step)
tests/unit/     Jest + Supertest tests
tests/e2e/      Playwright browser tests (also run against staging after deploy)
infra/          Bicep: bootstrap.bicep (GitHub OIDC identity), main.bicep (app)
.github/        CI/CD, infrastructure, rollback and load-test workflows
load/           k6 load test
scripts/        Post-deployment smoke test
docs/           Presentation, video script, references, Gen AI statement
```
