# 5-minute demo video script (target 4:40 so you stay under 5:00)

Record with **Xbox Game Bar** (Win + Alt + R) or **OBS Studio**, which is free. Show your face or voice as the module requires. Before you record, push a small visible change, such as changing the logo colour in `public/styles.css`, so you can show it going live.

| Time | Show on screen | Say (roughly) |
|---|---|---|
| 0:00–0:20 | Title slide | "This is ClipWave, a cloud-native short-video app I designed and deployed on Azure, with CI/CD, automated tests and canary releases." |
| 0:20–1:00 | Architecture slide | Browser → Container Apps → Cosmos DB / Blob Storage. Explain the **valet-key pattern**: videos upload directly to Blob Storage with a SAS URL, so the API is stateless and scales horizontally. |
| 1:00–1:50 | **Live app** (production URL) | Sign up, upload a clip, show it appear in the feed, like it, add a comment. Point at the version badge (revision name). |
| 1:50–2:20 | Azure portal: resource group | Show the resources: Container Apps env, two apps, Cosmos DB (free tier badge), storage account, App Insights. |
| 2:20–3:40 | GitHub Actions run | Walk through the pipeline: lint → unit tests (coverage) → Playwright e2e → image build + Trivy scan → staging deploy + smoke test + e2e → **approval** → canary 10% → **approval** → promote 100%. Show the **Revisions** blade with the 90/10 split. Refresh the app to show the new version. |
| 3:40–4:10 | Load test + scaling | Show k6 results (p95 latency, 0% errors) and the replica-count chart scaling out. Show Application Insights Live Metrics or the Application Map. |
| 4:10–4:30 | Rollback | Run "Rollback production" (or show it) and explain automatic rollback if the canary smoke test fails. |
| 4:30–4:40 | Conclusion slide | Free-tier cost, limitations, future work. |

Tips: run the pipeline **before** recording and approve the stages live, or speed up the waiting parts in editing. Keep the browser zoomed to 125% so text is readable.
