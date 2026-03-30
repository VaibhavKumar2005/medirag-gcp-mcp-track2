# GCP Simplification Strategy for Multi-Agent Productivity System

## Why Simplify?

GCP's serverless architecture (Cloud Run, Cloud Functions) works best with:
- **Focused scope**: Well-defined responsibilities
- **Fast cold starts**: Smaller, stateless containers
- **Cost efficiency**: Pay only for what you use
- **Easy scaling**: No infrastructure management

This guide shows 3 levels of simplification for GCP deployment.

---

## Level 1: Absolute MVP (Fastest to Deploy - 5 Days)

### Scope Reduction

```
REMOVE:
❌ Calendar Agent
❌ Notes Agent  
❌ Multi-agent routes
❌ Semantic search
❌ Complex workflows
✅ KEEP: Task Agent ONLY

SIMPLIFY:
- Single database table (tasks)
- Basic REST API
- Single Cloud Run service
- No Redis needed
```

### Architecture

```
User Request
    ↓
Cloud Run Service (Single Instance)
    │
    ├─ Django Task API
    ├─ Basic Task MCP Tools
    └─ Simple LLM prompting
    ↓
Cloud SQL (PostgreSQL)
    └─ tasks table
    ↓
Response
```

### Implementation (Week 1)

**File: models.py**
```python
from django.db import models

class Task(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('done', 'Done'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('high', 'High'),
    ]
    
    user_id = models.IntegerField()
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='low')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-priority', 'due_date']
```

**File: mcp_server.py (Minimal)**
```python
from fastmcp import FastMCP

mcp = FastMCP(name="task-assistant", version="1.0.0")

@mcp.tool()
def create_task(title: str, priority: str = "low", due_date: str = None) -> dict:
    """Create a new task"""
    from ai_engine.models import Task
    task = Task.objects.create(
        user_id=1,  # TODO: Get from auth
        title=title,
        priority=priority,
        due_date=due_date
    )
    return {"task_id": task.id, "status": "created", "title": title}

@mcp.tool()
def list_tasks() -> dict:
    """List all tasks"""
    from ai_engine.models import Task
    tasks = Task.objects.filter(status='open').order_by('-priority')
    return {
        "tasks": [
            {"id": t.id, "title": t.title, "priority": t.priority, "due_date": t.due_date}
            for t in tasks
        ]
    }

@mcp.tool()
def complete_task(task_id: int) -> dict:
    """Mark task as complete"""
    from ai_engine.models import Task
    task = Task.objects.get(id=task_id)
    task.status = 'done'
    task.save()
    return {"status": "completed", "task_id": task_id}
```

**File: views.py (Minimal)**
```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny  # TODO: Add auth in production
from rest_framework.response import Response
from ai_engine.models import Task

@api_view(['POST'])
@permission_classes([AllowAny])
def create_task(request):
    """Create task via REST API"""
    title = request.data.get('title')
    priority = request.data.get('priority', 'low')
    due_date = request.data.get('due_date')
    
    task = Task.objects.create(
        user_id=1,
        title=title,
        priority=priority,
        due_date=due_date
    )
    return Response({"task_id": task.id, "status": "created"})

@api_view(['GET'])
@permission_classes([AllowAny])
def list_tasks(request):
    """List tasks"""
    tasks = Task.objects.filter(status='open')
    return Response({
        "tasks": [
            {"id": t.id, "title": t.title, "priority": t.priority}
            for t in tasks
        ]
    })
```

**File: Dockerfile (Minimal)**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements-minimal.txt .
RUN pip install -r requirements-minimal.txt

COPY . .

CMD ["gunicorn", "--workers=1", "--threads=4", "--worker-class=gthread", \
     "--bind=0.0.0.0:8080", "rag_backend.wsgi:application"]
```

**File: requirements-minimal.txt**
```
Django==5.1.15
djangorestframework==3.17.0
psycopg2-binary==2.9.10
gunicorn==25.1.0
fastmcp>=2.0.0
uvicorn==0.34.0
google-generativeai>=0.8.0
```

### GCP Deployment

```bash
# 1. Create Cloud SQL instance (smallest tier)
gcloud sql instances create task-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \  # $$ smallest
  --storage-size=5GB

# 2. Create database
gcloud sql databases create task_db --instance=task-db

# 3. Build and deploy
gcloud run deploy task-assistant \
  --source . \
  --region us-central1 \
  --memory 256Mi \
  --cpu 0.5 \
  --timeout 60
```

### Cost Estimate
- **Cloud SQL**: ~$8/month (db-f1-micro)
- **Cloud Run**: ~$3-5/month (mostly free tier)
- **Storage**: ~$0.50/month
- **Total**: ~$12-15/month

---

## Level 2: Basic Multi-Agent (2-3 Weeks)

Adds Calendar + Notes agents without full complexity.

### Scope

```
✅ Task Agent
✅ Calendar Agent (simplified - no availability queries)
✅ Notes Agent (no semantic search)
✅ Basic Coordinator (simple routing)
✅ Redis caching
❌ Semantic search
```

### When to Use Level 2
- Team wants more features than MVP
- Have 2-3 weeks to build
- Budget: $50-100/month

### Key Differences from Full System

1. **Simplified Calendar**
   - Don't query attendee availability
   - Just schedule at proposed time
   - If conflict, suggest different time

2. **Simplified Notes**
   - Basic text search (no embeddings/pgvector)
   - Just grep-style full-text search

3. **Lightweight Coordinator**
   - Simple intent routing
   - No complex multi-step workflows
   - Sequential execution only

### Database Schema

```sql
-- Still minimal
CREATE TABLE task (... );        -- as before
CREATE TABLE note (
    id UUID PRIMARY KEY,
    user_id INT,
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMP
);
CREATE TABLE calendar_event (
    id UUID PRIMARY KEY,
    user_id INT,
    title VARCHAR(255),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    gcal_event_id VARCHAR(255)  -- Reference to external Google Calendar
);

-- No pgvector, no complex indexes
```

### Implementation Pattern

```python
# agents/coordinator.py - Simple Router
class Coordinator:
    async def handle(self, user_input: str):
        # 1. Simple intent classification
        if "create" in user_input.lower() and "task" in user_input.lower():
            agent = self.task_agent
            action = "create"
        elif "schedule" in user_input.lower() or "meeting" in user_input.lower():
            agent = self.calendar_agent
            action = "schedule"
        elif "note" in user_input.lower():
            agent = self.notes_agent
            action = "create_note"
        
        # 2. Execute single agent (no multi-agent orchestration)
        result = await agent.execute(action, user_input)
        
        return result
```

### GCP Deployment (Level 2)

```bash
# 1. Create Cloud SQL (small)
gcloud sql instances create productivity-db \
  --database-version=POSTGRES_15 \
  --tier=db-custom-1-3840 \
  --storage-size=10GB

# 2. Create Redis
gcloud redis instances create productivity-cache \
  --size=1

# 3. Deploy Cloud Run
gcloud run deploy productivity-assistant \
  --source . \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars REDIS_HOST=redis-host
```

### Cost Estimate
- **Cloud SQL**: ~$20-30/month
- **Redis**: ~$25/month
- **Cloud Run**: ~$5-10/month
- **Total**: ~$50-65/month

---

## Level 3: Production (4-6 Weeks)

Full system with all agents, semantic search, advanced workflows.

### When to Use Level 3
- Enterprise deployment
- Complex workflows needed
- Multi-tenant support
- Advanced monitoring required
- Budget: $100-200+/month

### See: MULTI_AGENT_PRODUCTIVITY_DESIGN.md for full details

---

## Comparison Table

| Feature | Level 1 (MVP) | Level 2 (Basic) | Level 3 (Full) |
|---------|--------------|---------------|----|
| **Agents** | Task only | Task + Calendar + Notes | All + extensibility |
| **Coordinator** | N/A | Simple router | Advanced orchestrator |
| **Search** | Basic text | Text search | Semantic (pgvector) |
| **Workflows** | Single-agent | Sequential | Parallel + complex |
| **Time** | 5 days | 2-3 weeks | 4-6 weeks |
| **Cost/month** | $12-15 | $50-65 | $100-200+ |
| **Scaling** | Up to 10 users | Up to 100 users | 1000+ users |

---

## Migration Path

### Phase 1: Deploy Level 1
```
Weeks 1-2:
  - Build task agent MVP
  - Deploy to Cloud Run
  - Get user feedback
```

### Phase 2: Expand to Level 2
```
Weeks 3-4:
  - Add Calendar agent
  - Add Notes agent
  - Implement Redis caching
  - Migrate database (backward compatible)
```

### Phase 3: Reach Level 3
```
Weeks 5-6:
  - Add semantic search (pgvector)
  - Advanced workflows
  - Multi-tenancy
  - Monitoring & observability
```

---

## GCP Cost Optimization Tips

### For Level 1:
- Use `db-f1-micro` Cloud SQL (shared resources)
- Cloud Run auto-scales to zero
- No Redis needed

### For Level 2:
- Use `db-custom-1-3840` (1 CPU, 3.75 GB)
- Redis cache: Start with smallest (1 GB)
- Cloud Run memory: 256-512 MB

### For Level 3:
- Use `db-custom-2-7680` (2 CPU, 7.5 GB)
- Redis: 2-5 GB
- Cloud Run: 1-2 CPU per instance
- Consider Committed Use Discounts (CUD)

---

## Quick Start: Deploy Level 1 to GCP (Today)

### 1. Prepare Code

```bash
# In your project directory
mkdir -p apps/backend

# Create minimal models, views, mcp_server files
# See code examples above
```

### 2. Create Docker Image

```bash
docker build -t gcr.io/my-project/task-assistant:latest .
docker push gcr.io/my-project/task-assistant:latest
```

### 3. Set Up GCP

```bash
# Set project
PROJECT_ID="my-gcp-project"
gcloud config set project $PROJECT_ID

# Create Cloud SQL
gcloud sql instances create task-db \
  --tier=db-f1-micro \
  --region=us-central1 \
  --database-version=POSTGRES_15

# Create database
gcloud sql databases create task_db --instance=task-db

# Deploy to Cloud Run
gcloud run deploy task-assistant \
  --image gcr.io/$PROJECT_ID/task-assistant:latest \
  --region us-central1 \
  --allow-unauthenticated
```

### 4. Test

```bash
# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe task-assistant \
  --region us-central1 --format 'value(status.url)')

# Create a task
curl -X POST "$SERVICE_URL/api/task/" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Task",
    "priority": "high"
  }'
```

---

## Recommendations

### Choose Level 1 if:
- ✅ Quick proof-of-concept needed
- ✅ Budget-conscious
- ✅ Task management is primary use case
- ✅ Can build on it later

### Choose Level 2 if:
- ✅ Team wants multiple features
- ✅ 3+ people will use it
- ✅ Mix of tasks, calendar, notes needed
- ✅ 2-3 week timeline acceptable

### Choose Level 3 if:
- ✅ Enterprise deployment required
- ✅ Complex workflows needed
- ✅ Multiple teams/tenants
- ✅ 4-6 week timeline
- ✅ Budget available

---

## Next Steps

1. **If starting today**: Use Level 1 template above
2. **If have 2-3 weeks**: Use Level 2 guide in QUICK_IMPLEMENTATION_GUIDE.md
3. **If planning long-term**: See MULTI_AGENT_PRODUCTIVITY_DESIGN.md for Level 3

All are built on same tech stack (Django, FastMCP, PostgreSQL, GCP) - migrate between levels without rewriting.
