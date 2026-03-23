# GCP Workload Identity Federation — Setup Guide

> OIDC keyless authentication for GitHub Actions → Google Cloud Run  
> No JSON service account keys. No long-lived credentials. No risk.

---

## What this configures

Every push to `track-2-mcp-submission` triggers a GitHub Actions workflow that deploys three Cloud Run services. Instead of storing a service account JSON key in GitHub Secrets, this project uses **Workload Identity Federation** — GitHub Actions gets a short-lived OIDC token that GCP validates directly.

```
GitHub Actions  →  issues OIDC token
GCP WIF Pool    →  validates token (checks repo + branch)
GCP             →  issues temporary access token (< 1 hour)
Cloud Build     →  deploys with temporary credentials
                   (credentials expire automatically)
```

---

## Setup checklist

### Step 1 — Create a Workload Identity Pool

```bash
# Create the pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="project-5f9ff1f2-755e-4532-bcd" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create the OIDC provider inside the pool
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="project-5f9ff1f2-755e-4532-bcd" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### Step 2 — Create (or identify) the deploying service account

```bash
gcloud iam service-accounts create "github-deploy-sa" \
  --project="project-5f9ff1f2-755e-4532-bcd" \
  --display-name="GitHub Actions Deploy SA"
```

### Step 3 — Grant the service account the roles it needs

```bash
PROJECT="project-5f9ff1f2-755e-4532-bcd"
SA="github-deploy-sa@${PROJECT}.iam.gserviceaccount.com"

# Cloud Run deployer
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/run.admin"

# Cloud Build submitter
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/cloudbuild.builds.editor"

# Artifact Registry writer
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/artifactregistry.writer"

# Service Account User (allows Cloud Build to act as the SA)
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/iam.serviceAccountUser"

# Service Usage Consumer (required by Cloud Build)
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

### Step 4 — Bind the GitHub repo + branch to the service account

```bash
PROJECT="project-5f9ff1f2-755e-4532-bcd"
SA="github-deploy-sa@${PROJECT}.iam.gserviceaccount.com"
POOL="projects/${PROJECT}/locations/global/workloadIdentityPools/github-pool"
REPO="VaibhavKumar2005/verirag-gcp-mcp-track2"
BRANCH="track-2-mcp-submission"

gcloud iam service-accounts add-iam-policy-binding "${SA}" \
  --project="${PROJECT}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL}/attribute.repository/${REPO}"
```

> **Why `attribute.repository` and not `attribute.ref`?**  
> Using `repository` means any branch in the repo can deploy. If you want to restrict to only `track-2-mcp-submission`, use the condition below instead:

```bash
# Optional: restrict to specific branch only
gcloud iam workload-identity-pools providers update-oidc "github-provider" \
  --project="${PROJECT}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --attribute-condition="assertion.ref=='refs/heads/${BRANCH}' && assertion.repository=='${REPO}'"
```

### Step 5 — Get the provider resource name

```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="project-5f9ff1f2-755e-4532-bcd" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

This outputs something like:
```
projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

### Step 6 — Add GitHub repository secrets

Go to: `https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2/settings/secrets/actions`

Add two **Secrets** (not variables):

| Secret name | Value |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | The full provider resource name from Step 5 |
| `GCP_SERVICE_ACCOUNT` | `github-deploy-sa@project-5f9ff1f2-755e-4532-bcd.iam.gserviceaccount.com` |

---

## How the workflow uses these secrets

```yaml
# .github/workflows/track-2-google-submission.yml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
```

The `google-github-actions/auth` action:
1. Requests an OIDC token from GitHub
2. Exchanges it with GCP for a short-lived access token
3. Sets up Application Default Credentials for the rest of the workflow

No JSON key file is ever created, stored, or transmitted.

---

## Verify it's working

After pushing to `track-2-mcp-submission`, check the Actions tab. The auth step should show:

```
✓ Created credentials file at "..."
✓ Authenticated as github-deploy-sa@...
```

If you see a 403 Forbidden, the most common causes are:
1. The `attribute.repository` binding in Step 4 doesn't match the repo name exactly
2. The branch doesn't match the `attribute-condition` if you added one in Step 4
3. The service account is missing one of the roles from Step 3

---

## Security properties

| Property | Status |
|---|---|
| Long-lived JSON key files | ✅ None — never created |
| Credentials in GitHub Secrets | ✅ Only provider reference + SA email (not secret values) |
| Token lifetime | ✅ < 1 hour — expires automatically after each job |
| Scope | ✅ Bound to specific repository (and optionally branch) |
| Audit trail | ✅ Every Cloud Build invocation logged in Cloud Audit Logs |

---

*MediRAG · GCP Workload Identity Federation setup*
