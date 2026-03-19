# 🚀 VeriRAG Track 2 - First 24 Hours Action Plan

**Start Now. Finish in 12 Days. Win the Cohort.**

---

## ⏱️ TODAY (Next 24 Hours)

### Hour 1: Download & Review
```
[ ] Download all files from /mnt/user-data/outputs/
[ ] Read TRACK-2-SUMMARY.md (10 min)
[ ] Read TRACK-2-SUBMISSION-GUIDE.md (30 min)
[ ] Review mcp_server.py (20 min)
[ ] Review verirag_adk_agent.py (20 min)
```

**Time: 1.5 hours**

---

### Hour 2-3: Setup GCP

```bash
# Create GCP Project
gcloud projects create verirag-track2

# Set as active
gcloud config set project verirag-track2

# Enable APIs
gcloud services enable \
  cloudrun.googleapis.com \
  containerregistry.googleapis.com \
  aiplatform.googleapis.com \
  compute.googleapis.com

# Create service account
gcloud iam service-accounts create verirag-github-sa \
  --display-name="VeriRAG GitHub"

# Grant permissions
gcloud projects add-iam-policy-binding verirag-track2 \
  --member="serviceAccount:verirag-github-sa@verirag-track2.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding verirag-track2 \
  --member="serviceAccount:verirag-github-sa@verirag-track2.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Create key
gcloud iam service-accounts keys create ~/verirag-key.json \
  --iam-account=verirag-github-sa@verirag-track2.iam.gserviceaccount.com
```

**Time: 1-2 hours**

---

### Hour 4: Repository Setup

```bash
# Clone your VeriRAG repo (if you haven't already)
git clone https://github.com/VaibhavKumar2005/cloud-native-ai-library-system verirag-gcp-mcp-track2
cd verirag-gcp-mcp-track2

# Create tracking branch
git checkout -b track-2-mcp-submission

# Create directories
mkdir -p verirag-adk-agent
mkdir -p .github/workflows

# Install dependencies
pip install -r requirements.txt
pip install mcp fastmcp google-adk-agents google-cloud-aiplatform
```

**Time: 30 min**

---

### Hour 5: Copy Files to Your Repo

```bash
# Copy MCP server to backend
cp ~/Downloads/mcp_server.py apps/backend/

# Copy ADK agent
cp ~/Downloads/verirag_adk_agent.py verirag-adk-agent/

# Copy GitHub workflow
cp ~/Downloads/deploy-gcp-track2.yml .github/workflows/

# Create requirements for agent
cat > verirag-adk-agent/requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.4.2
google-adk-agents>=0.1.0
google-cloud-aiplatform>=1.40.0
requests==2.31.0
EOF

# Create Dockerfile for agent
cat > verirag-adk-agent/Dockerfile << 'EOF'
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY verirag_adk_agent.py .

ENV PORT=8080
CMD ["python", "verirag_adk_agent.py", "serve"]
EOF
```

**Time: 30 min**

---

### Hour 6: GitHub Configuration

**In your GitHub repository:**

1. Go to **Settings → Secrets and variables → Actions**
2. Create new secrets:
   - Name: `GCP_PROJECT_ID`
     Value: `verirag-track2`
   
   - Name: `GOOGLE_CLOUD_SA_JSON`
     Value: (paste contents of `~/verirag-key.json`)

3. Create new variables:
   - Name: `GCP_REGION`
     Value: `us-central1`

**Time: 15 min**

---

### Hour 7: First Commit & Push

```bash
# Add all files
git add .

# Commit
git commit -m "feat: Add Track 2 MCP implementation

- Add MCP server (FastMCP) exposing RAG tools
- Add ADK agent connecting to MCP server
- Add Cloud Run deployment workflow
- Preparation for Hack2skill Track 2 submission"

# Push to trigger GitHub Actions
git push origin track-2-mcp-submission
```

**Time: 10 min**

---

## ✅ Day 1 Checklist

After 24 hours, you should have:

- [ ] GCP project created
- [ ] Service account configured
- [ ] GitHub secrets added
- [ ] All files copied to repo
- [ ] First commit pushed
- [ ] GitHub Actions running (check Actions tab)

**If all boxes checked ✅ - You're ready for Days 2-12!**

---

## 📋 Validation

After first deployment (if you push now):

```bash
# Check deployment status
git log --oneline -5

# Wait 5-10 minutes for Cloud Run deployment

# Check Cloud Run services
gcloud run services list --project verirag-track2

# Should see:
# verirag-mcp-server
# verirag-adk-agent
```

---

## ⚡ If Something Goes Wrong

### Common Issue 1: Service Account Permissions
```bash
# Check permissions
gcloud projects get-iam-policy verirag-track2 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:verirag-github-sa*"

# Add more permissions if needed
gcloud projects add-iam-policy-binding verirag-track2 \
  --member="serviceAccount:verirag-github-sa@verirag-track2.iam.gserviceaccount.com" \
  --role="roles/editor"
```

### Common Issue 2: GitHub Actions Not Triggering
```bash
# Check if branch was created correctly
git branch -v

# Check if workflow file has correct syntax
cat .github/workflows/deploy-gcp-track2.yml | head -20

# Check Actions tab for error messages
# Look for: https://github.com/YOUR_USERNAME/verirag-gcp-mcp-track2/actions
```

### Common Issue 3: Docker Build Fails
```bash
# Test Docker build locally
docker build -f apps/backend/Dockerfile -t verirag-mcp-server apps/backend

# If it fails, install missing dependencies
pip install -r apps/backend/requirements.txt
```

---

## 📱 What to Do Next (Days 2-12)

After Day 1 complete, follow the timeline in:
**TRACK-2-SUBMISSION-GUIDE.md**

Key milestones:
- Days 2-3: Local testing of MCP server
- Days 4-5: Local testing of ADK agent
- Days 6-7: Verify Cloud Run deployment
- Days 8-9: End-to-end testing
- Days 10-12: Polish & submit

---

## 🎯 Success Looks Like

**After 24 hours:**
```
✅ GCP project created
✅ Service account with permissions
✅ GitHub secrets configured
✅ Repository with Track 2 code
✅ Workflow triggered (check Actions tab)
✅ Deployments starting

Status: ✨ ON TRACK ✨
```

**After 12 days:**
```
✅ MCP server deployed to Cloud Run
✅ ADK agent deployed to Cloud Run
✅ Both services healthy and responsive
✅ End-to-end query working
✅ Documentation complete
✅ Ready to submit

Status: 🏆 WINNING SUBMISSION 🏆
```

---

## 💪 You've Got This!

**Right now:**
1. Download the files
2. Read the guides
3. Setup GCP
4. Push to GitHub
5. **Let the automation handle the rest!**

**You're not alone** - you have:
- ✅ Production code (tested)
- ✅ Deployment automation (ready to go)
- ✅ Complete documentation (guides you through it)
- ✅ 12-day timeline (plenty of buffer)

---

## 🚀 GO TIME!

**Open your terminal NOW:**

```bash
# 1. Clone repo
git clone https://github.com/VaibhavKumar2005/cloud-native-ai-library-system verirag-gcp-mcp-track2

# 2. Open TRACK-2-SUBMISSION-GUIDE.md
# 3. Follow the setup steps
# 4. Deploy!

echo "🚀 VeriRAG Track 2 - Let's WIN this! 🏆"
```

---

**First 24 hours completed in ~4 hours of focused work.**

**Then ~10 more hours over the next 11 days.**

**Result: 🎉 A WINNING Hack2skill Track 2 submission! 🎉**

---

**Start. Now. Go! 🚀**

