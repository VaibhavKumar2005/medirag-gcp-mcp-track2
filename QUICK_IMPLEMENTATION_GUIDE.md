# Multi-Agent Productivity Assistant - Quick Implementation Guide

## Executive Summary

### What's Being Built
A multi-agent AI system where:
- **Coordinator Agent** (main): Understands user intent, orchestrates sub-agents
- **Task Agent**: Manages task creation, prioritization, completion tracking
- **Calendar Agent**: Schedules meetings, finds free slots, prevents conflicts
- **Notes Agent**: Creates/searches notes, links to tasks/events

### Key Innovation
Instead of a single AI agent trying to do everything, you have:
1. **Specialization**: Each agent is expert in one domain
2. **Coordination**: Coordinator delegates and aggregates
3. **Workflows**: Handle multi-step processes (e.g., "schedule meeting + create prep task + add notes")

### Why This Matters
- **User Request**: "Schedule a call with team tomorrow, prep materials, and remind me of key points"
- **Single Agent**: Struggles with coordination across domains
- **Multi-Agent**: CoordinAtor routes to Calendar (schedule), Task (create prep), Notes (add reminders)

---

## Architecture (Simplified)

```
User Input
    ↓
[Coordinator Agent] ← Decides what to do
    ↓
    ├─ [Task Agent] ← Create/manage/complete tasks
    │   └─ MCP Tools: create_task, list_tasks, complete_task
    │       └─ Database: tasks table
    │
    ├─ [Calendar Agent] ← Schedule meetings, find free time
    │   └─ MCP Tools: schedule_meeting, find_free_slots
    │       └─ Integrations: GCP Calendar API
    │
    └─ [Notes Agent] ← Create/search notes
        └─ MCP Tools: create_note, search_notes
            └─ Database: notes table + pgvector for search
    ↓
[Aggregate Results]
    ↓
Response to User
```

---

## Implementation Path (4 Weeks)

### Week 1: Task Agent Foundation
```python
# 1. Define Task Model
class Task(models.Model):
    title = models.CharField(max_length=255)
    status = models.CharField(choices=[...])  # open, in_progress, completed
    priority = models.CharField(choices=[...])  # low, medium, high, critical
    due_date = models.DateField(null=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)

# 2. Create MCP Tools
@mcp.tool()
def create_task(title, due_date, priority):
    task = Task.objects.create(...)
    return {"task_id": task.id, "status": "created"}

@mcp.tool()
def list_tasks(filter_by="all"):
    tasks = Task.objects.filter(...)
    return {"tasks": [...]}

# 3. Build Basic Coordinator
class CoordinatorAgent:
    async def handle_request(self, user_input):
        intent = classify_intent(user_input)
        if intent == "TASK":
            return await task_agent.execute(user_input)
```

**Deliverable**: Can create, list, complete tasks

---

### Week 2: Calendar & Notes Agents
```python
# Calendar Agent
@mcp.tool()
def find_free_slots(attendees, date_range):
    # Query GCP Calendar API
    calendar_service = get_calendar_service()
    # Find common free time
    return {"slots": [...]}

@mcp.tool()
def schedule_meeting(title, attendees, time):
    # Create calendar event, send invites
    return {"event_id": ..., "meet_link": ...}

# Notes Agent
@mcp.tool()
def create_note(title, content, tags):
    note = Note.objects.create(...)
    return {"note_id": note.id}

@mcp.tool()
def search_notes(query):
    # Semantic search via pgvector
    results = Note.objects.annotate(...).order_by('...')
    return {"results": [...]}
```

**Deliverable**: All 3 agents with tools working

---

### Week 3: Multi-Agent Coordination
```python
# Coordinator routes to multiple agents
class CoordinatorAgent:
    async def handle_multi_agent_request(self, user_input):
        # "Schedule meeting tomorrow and create prep task"
        
        # Parse intent → [CALENDAR, TASK]
        intents = parse_intents(user_input)
        
        # Execute in parallel
        results = await asyncio.gather(
            self.calendar_agent.schedule_meeting(...),
            self.task_agent.create_task(...)
        )
        
        # Link results
        task.linked_event = results[0]['event_id']
        task.save()
        
        return aggregate_response(results)
```

**Deliverable**: Multi-step workflows working

---

### Week 4: Production Polish
- Error handling & fallbacks
- Caching (Redis)
- Logging & tracing
- Deploy to GCP Cloud Run

---

## GCP Deployment (Simplified)

### Infrastructure
```bash
# 1. Cloud SQL PostgreSQL
gcloud sql instances create productivity-db \
  --database-version=POSTGRES_15 \
  --tier=db-custom-2-7680

# 2. Cloud Memorystore Redis
gcloud redis instances create productivity-cache \
  --size=2

# 3. Deploy to Cloud Run
gcloud run deploy productivity-assistant \
  --image gcr.io/my-project/productivity-assistant:latest \
  --region us-central1 \
  --platform managed
```

### Database Setup (One-Time)
```sql
-- Create tables
CREATE TABLE task (
    id UUID PRIMARY KEY,
    user_id INT,
    title VARCHAR(255),
    status VARCHAR(20),
    priority VARCHAR(20),
    due_date DATE,
    created_at TIMESTAMP
);

CREATE TABLE note (
    id UUID PRIMARY KEY,
    user_id INT,
    title VARCHAR(255),
    content TEXT,
    embedding vector(768),  -- For semantic search
    created_at TIMESTAMP
);

-- Enable pgvector
CREATE EXTENSION vector;
```

---

## API Examples

### 1. Create Task
```bash
POST /api/agent/task
{
  "action": "create",
  "title": "Review Q2 budget",
  "due_date": "2026-04-15",
  "priority": "high"
}

→ {
  "task_id": "task-123",
  "status": "created",
  "title": "Review Q2 budget"
}
```

### 2. Find Meeting Time
```bash
POST /api/agent/calendar
{
  "action": "find_free_slots",
  "attendees": ["alice@...", "bob@..."],
  "date_range": "next_week",
  "duration_minutes": 60
}

→ {
  "slots": [
    {"time": "Mon 2pm", "confidence": 0.95},
    {"time": "Wed 10am", "confidence": 0.90}
  ],
  "best_slot": {"time": "Mon 2pm"}
}
```

### 3. Coordinator: Multi-Step Workflow
```bash
POST /api/agent/workflow
{
  "user_input": "Schedule planning meeting with team for next week, 
                create agenda task, and add background notes"
}

→ {
  "workflow_id": "wf-001",
  "status": "success",
  "results": {
    "calendar_event": {
      "event_id": "evt-123",
      "title": "Planning Meeting",
      "time": "Wed 2pm",
      "meet_link": "https://meet.google.com/..."
    },
    "task": {
      "task_id": "task-456",
      "title": "Create meeting agenda",
      "due_date": "2026-04-01"
    },
    "note": {
      "note_id": "note-789",
      "title": "Planning Meeting - Background",
      "linked_task": "task-456",
      "linked_event": "evt-123"
    }
  }
}
```

---

## File Structure

```
apps/backend/
├── ai_engine/
│   ├── models.py              # Task, Note, CalendarEvent
│   ├── views.py               # REST API endpoints
│   ├── agents/
│   │   ├── coordinator.py     # Main orchestrator
│   │   ├── task_agent.py      # Task management
│   │   ├── calendar_agent.py  # Meeting scheduling
│   │   └── notes_agent.py     # Note management
│   └── tools/
│       ├── task_tools.py      # MCP task tools
│       ├── calendar_tools.py  # MCP calendar tools
│       └── notes_tools.py     # MCP notes tools
├── mcp_server.py              # FastMCP entry point
├── requirements.txt
└── manage.py

Migrations:
├── 0001_create_task_model.py
├── 0002_create_note_model.py
├── 0003_create_calendar_event_model.py
└── 0004_create_workflow_execution_model.py
```

---

## Key Technologies Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **LLM** | Google Gemini 1.5 Flash | Fast, cost-effective, native GCP |
| **Agents** | FastMCP >= 2.0 | Model Context Protocol for tool integration |
| **Web Framework** | Django + DRF | Existing skills, mature, production-ready |
| **Database** | PostgreSQL + pgvector | Persistent data + semantic search |
| **Cache** | Redis (Memorystore) | Session state, rate limiting, caching |
| **Hosting** | GCP Cloud Run | Serverless, auto-scaling, managed |
| **CI/CD** | Cloud Build | Native GCP integration |

---

## Monitoring & Observability

### Metrics to Track
```python
# Prometheus metrics
workflow_execution_time = Histogram(...)
coordinator_intent_accuracy = Gauge(...)
agent_tool_success_rate = Counter(...)
database_query_latency = Histogram(...)

# Logs (Cloud Logging)
logger.info(f"Coordinator route: {workflow_type} → {agents}")
logger.info(f"Task creation: {task_id} for user {user_id}")

# Traces (Cloud Trace)
@trace_span("task_creation")
def create_task(...):
    ...
```

### Dashboards
- **Real-time Dashboard**: Workflow execution, success rates, latency
- **Agent Performance**: Intent classification accuracy, tool success rates
- **User Metrics**: Tasks completed, meetings scheduled, notes created
- **System Health**: API latency, error rates, database performance

---

## Testing Strategy

### Unit Tests
```python
# tests/test_task_agent.py
def test_create_task():
    task = create_task("Test Task", "2026-04-01", "high")
    assert task.title == "Test Task"
    assert task.priority == "high"

def test_list_tasks_filter():
    tasks = list_tasks(filter_by="urgent")
    assert all(t.priority in ["high", "critical"] for t in tasks)
```

### Integration Tests
```python
# tests/test_coordinator.py
@pytest.mark.asyncio
async def test_multi_agent_workflow():
    result = await coordinator.handle_request(
        "Schedule meeting and create prep task"
    )
    assert result['calendar_event']['event_id']
    assert result['task']['task_id']
```

### Load Tests
```python
# tests/load_test.py
from locust import HttpLocust, TaskSet

class UserBehavior(TaskSet):
    def on_start(self):
        self.auth_token = get_auth_token()
    
    def create_task_workflow(self):
        self.client.post(
            "/api/agent/workflow",
            json={"user_input": "Create high priority task"},
            headers={"Authorization": f"Bearer {self.auth_token}"}
        )
```

---

## Security Considerations

1. **Multi-Tenancy**: Ensure tasks/notes belong to authenticated user
2. **Rate Limiting**: Prevent abuse (e.g., 100 workflows/hour per user)
3. **Data Encryption**: Encrypt sensitive notes at rest
4. **OAuth**: Delegate calendar access to GCP Calendar via service account
5. **Secret Management**: Use GCP Secret Manager for API keys

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Calendar agent fails | GCP Calendar API not enabled | `gcloud services enable calendar` |
| Tasks table not found | Migration not run | `python manage.py migrate` |
| Semantic search slow | pgvector index not built | Create index on embedding column |
| Coordinator timeout | Sub-agent taking too long | Increase timeout, profile agent |

---

## Next Steps

1. **Start with Task Agent** (1-2 days)
   - Create Task model, write MCP tools, test basic flows

2. **Add Calendar Agent** (2-3 days)
   - Integrate GCP Calendar API, implement find_free_slots

3. **Add Notes Agent** (2-3 days)
   - Create Note model, implement semantic search via pgvector

4. **Build Coordinator** (2-3 days)
   - Implement intent classification, multi-agent routing

5. **Deploy to GCP** (1-2 days)
   - Set up Cloud SQL, Redis, Cloud Run, CI/CD

6. **Polish & Monitor** (1-2 days)
   - Add observability, error handling, performance optimization

**Total: ~2-3 weeks for MVP, ~4-6 weeks for production-ready**

---

## Resources

- **MCP Documentation**: https://modelcontextprotocol.io
- **FastMCP**: https://github.com/jlowin/fastmcp
- **GCP Cloud Run**: https://cloud.google.com/run/docs
- **pgvector**: https://github.com/pgvector/pgvector
- **Django REST Framework**: https://www.django-rest-framework.org
