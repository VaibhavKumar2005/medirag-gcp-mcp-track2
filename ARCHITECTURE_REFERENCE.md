# Multi-Agent Productivity Assistant - Visual Architecture Reference

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                                  │
│                     React/Vite Dashboard                                │
│            User interacts via web or mobile app                         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTP/REST/WebSocket
                             │
┌────────────────────────────▼────────────────────────────────────────────┐
│                     API Gateway Layer                                   │
│                      FastAPI + FastMCP                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ - JWT Authentication                                           │   │
│  │ - Rate Limiting (Redis)                                        │   │
│  │ - Request Routing                                              │   │
│  │ - WebSocket Handling for streaming                             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Coordinator│   │ Django Views │   │ MCP HTTP    │
   │   Agent     │   │ (Legacy RAG) │   │ Transport   │
   │             │   │              │   │ Layer       │
   └──────┬──────┘   └──────────────┘   └─────┬───────┘
          │                                    │
          └────────────────┬───────────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │    Sub-Agent Execution Layer       │
         │  (Async task queue / workers)      │
         │                                    │
         │  ┌─────────┐ ┌──────────┐ ┌──────┐│
         │  │  Task   │ │ Calendar │ │Notes ││
         │  │  Agent  │ │  Agent   │ │Agent ││
         │  └────┬────┘ └────┬─────┘ └──┬───┘│
         │       │           │          │    │
         │       └───────┬───┴──────┬───┘    │
         │               │          │        │
         └───────────────┼──────────┼────────┘
                         │          │
         ┌───────────────▼──────────▼────────────┐
         │     MCP Tools Layer                   │
         │  (Business Logic Implementation)      │
         │                                       │
         │  ┌──────────────────────────────────┐ │
         │  │ Task Tools:                      │ │
         │  │  - create_task()                 │ │
         │  │  - list_tasks()                  │ │
         │  │  - complete_task()               │ │
         │  │  - prioritize_tasks()            │ │
         │  ├──────────────────────────────────┤ │
         │  │ Calendar Tools:                  │ │
         │  │  - find_free_slots()             │ │
         │  │  - schedule_meeting()            │ │
         │  │  - reschedule_event()            │ │
         │  ├──────────────────────────────────┤ │
         │  │ Notes Tools:                     │ │
         │  │  - create_note()                 │ │
         │  │  - search_notes()                │ │
         │  │  - link_note_to_task()           │ │
         │  └──────────────────────────────────┘ │
         │                                       │
         └───────────────┬──────────────────────┘
                         │
         ┌───────────────▼──────────────────────┐
         │   Data Access Layer (ORM)            │
         │     Django Models + Queries          │
         │                                      │
         │  - Task model & queryset            │
         │  - CalendarEvent model & queryset   │
         │  - Note model & queryset            │
         └───────────────┬──────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ PostgreSQL   │ │ Redis Cache  │ │ GCP Services    │
│ + pgvector   │ │ (Memorystore)│ │                 │
│              │ │              │ │ - Calendar API  │
│ - Tasks      │ │ - Sessions   │ │ - Secret Mgr    │
│ - Events     │ │ - Cache      │ │ - Logging       │
│ - Notes      │ │ - Rate limit │ │ - Monitoring    │
│ - Vectors    │ │   data       │ │                 │
└──────────────┘ └──────────────┘ └──────────────────┘
```

---

## Agent Coordination Flow

### Simple Single-Agent Request

```
User Input: "Create a task for tomorrow"
    ↓
Coordinator classifies:
  Intent = CREATE_TASK
  Domain = TASK
    ↓
Route to TaskAgent
    ↓
TaskAgent.create_task()
    ├─ Parse entities: title, due_date
    ├─ Create in database
    └─ Return task_id
    ↓
Response to user
```

### Multi-Agent Coordinated Workflow

```
User Input: "Schedule planning meeting with team next week,
            create prep task, and add agenda notes"
    ↓
Coordinator classifies:
  Intent = WORKFLOW
  Domains = [CALENDAR, TASK, NOTES] (in order)
  Execution = SEQUENTIAL
    ↓
Step 1: CalendarAgent.schedule_meeting()
  Input: "next week", attendees: [team]
  Output: event_id = evt-123, meet_link
    ↓
Step 2: TaskAgent.create_task()
  Input: title="Prepare meeting agenda", due=day_before_meeting
  Output: task_id = task-456
    ↓
Step 3: NotesAgent.create_note()
  Input: title="Meeting Agenda", linked_event=evt-123, linked_task=task-456
  Output: note_id = note-789
    ↓
Link all results together:
  task-456.linked_event = evt-123
  note-789.linked_task = task-456
  note-789.linked_event = evt-123
    ↓
Response to user:
{
  calendar: {event_id, title, time, meet_link},
  task: {task_id, title, due_date},
  note: {note_id, title}
}
```

### Parallel Multi-Agent Workflow

```
User Input: "Give me standup summary - my completed tasks this week,
            calendar for today, and any blocking issues"
    ↓
Coordinator classifies:
  Intent = AGGREGATE_REPORT
  Domains = [TASK, CALENDAR, NOTES]
  Execution = PARALLEL
    ↓
Execute all in parallel:

┌─────────────────────┬──────────────────┬────────────────────┐
│                     │                  │                    │
TaskAgent:          CalendarAgent:      NotesAgent:
list_tasks(         list_events(date)    search_notes(
  filter: completed  → [meeting1,        tags: ["blocker"])
  date_range: week   meeting2,...]       → [issue-note-1,
) → [task1, task2]                          issue-note-2]
                     
└─────────────────────┴──────────────────┴────────────────────┘
                     ↓
                Aggregate results:
           ┌─────────────────────┐
           │  Summary Report:    │
           │ - Completed: 5      │
           │ - Today's meetings: │
           │ - Blockers: 2       │
           └─────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ REQUEST                                                      │
│ {user_input: "Schedule meeting", user_id: 123}             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
            ┌──────────────────────┐
            │ Intent Classification │
            │ (via Gemini LLM)     │
            └────────┬─────────────┘
                     │
┌────────────────────▼──────────────────────────┐
│ Intent Result:                                │
│ {                                             │
│   type: "CALENDAR",                          │
│   action: "schedule_meeting",                │
│   entities: {                                │
│     title: "Team Sync",                      │
│     attendees: ["alice@", "bob@"],           │
│     date: "2026-04-02"                       │
│   },                                         │
│   confidence: 0.95                           │
│ }                                             │
└────────────────────┬──────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │ Agent Selector         │
         │ (Route to Calendar)    │
         └───────────┬────────────┘
                     │
      ┌──────────────▼──────────────┐
      │ CalendarAgent.execute()      │
      │ Input: intent.entities      │
      └──────────────┬───────────────┘
                     │
      ┌──────────────▼──────────────┐
      │ find_free_slots()            │
      │  → Query GCP Calendar API    │
      │  → Analyze attendee schedules│
      │  → Return available slots    │
      └──────────────┬───────────────┘
                     │
      ┌──────────────▼──────────────┐
      │ schedule_meeting()           │
      │  → Create calendar event    │
      │  → Send invites             │
      │  → Store in PostgreSQL      │
      └──────────────┬───────────────┘
                     │
┌────────────────────▼──────────────────────────┐
│ Response:                                     │
│ {                                             │
│   status: "success",                         │
│   event: {                                   │
│     id: "evt-123",                           │
│     title: "Team Sync",                      │
│     time: "2026-04-02 14:00",               │
│     meet_link: "https://meet.google.com/#" │
│   }                                          │
│ }                                             │
└────────────────────────────────────────────────┘
```

---

## Database Schema Diagram

```
┌──────────────────────────────────────┐
│         Task Table                   │
├──────────────────────────────────────┤
│ id (UUID) PK                         │
│ user_id (INT) FK → User              │
│ title (VARCHAR)                      │
│ description (TEXT)                   │
│ status (ENUM)                        │  open
│ priority (ENUM)                      │  in_progress
│ due_date (DATE)                      │  completed
│ created_at (TIMESTAMP)               │  blocked
│ updated_at (TIMESTAMP)               │
│ completed_at (TIMESTAMP) NULL        │
│ tags (JSONB) = []                    │
│ linked_events (JSONB) = []           │
│ linked_notes (JSONB) = []            │
└──────────────────────────────────────┘
          │                  │
      M:N │                  │ M:N
          │                  │
    ┌─────▼──────────────────▼─────┐  ┌──────────────────────────┐
    │ Calendar Event Table          │  │ Note Table               │
    ├───────────────────────────────┤  ├──────────────────────────┤
    │ id (UUID) PK                  │  │ id (UUID) PK             │
    │ user_id (INT) FK → User       │  │ user_id (INT) FK → User  │
    │ gcal_event_id (VARCHAR)       │  │ title (VARCHAR)          │
    │ title (VARCHAR)               │  │ content (TEXT)           │
    │ description (TEXT)            │  │ category (VARCHAR)       │
    │ start_time (TIMESTAMP)        │  │ tags (JSONB) = []        │
    │ end_time (TIMESTAMP)          │  │ embedding (vector 768)   │
    │ location (VARCHAR)            │  │ linked_tasks (JSONB) []  │
    │ attendees (JSONB)             │  │ linked_events (JSONB) [] │
    │  [{email, status}]            │  │ created_at (TIMESTAMP)   │
    │ meet_link (VARCHAR)           │  │ updated_at (TIMESTAMP)   │
    │ is_recurring (BOOL)           │  └──────────────────────────┘
    │ recurrence_rule (VARCHAR)     │
    │ created_at (TIMESTAMP)        │
    │ updated_at (TIMESTAMP)        │
    └───────────────────────────────┘

Other tables:
┌─────────────────────────────────────┐
│  Workflow Execution (Audit Log)     │
├─────────────────────────────────────┤
│ id (UUID), user_id, workflow_type   │
│ user_input (TEXT)                   │
│ classifier_intent (JSONB)           │
│ coordinator_response (JSONB)        │
│ status, duration_seconds            │
│ trace_id (VARCHAR)                  │
│ created_at (TIMESTAMP)              │
└─────────────────────────────────────┘
```

---

## GCP Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Global HTTPS Traffic                           │
│         (from users worldwide)                              │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────▼──────────────┐
        │ Cloud Load Balancer       │
        │ (Global)                  │
        │ - HTTPS termination       │
        │ - Route to Cloud Run      │
        │ - DDoS protection         │
        └────────────┬───────────────┘
                     │
        ┌────────────▼──────────────┐
        │ Cloud Run (Microservice)  │
        │ - Regional (us-central1)  │
        │ - 0-50 instances (auto)   │
        │ - Concurrency: 100 req    │
        │ - Memory: 512MB-2GB       │
        │ - CPU: 0.5-2 cores       │
        └────────────┬───────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌────────────────┐
│ Cloud SQL    │ │ Memorystore  │ │ Secret Manager │
│ PostgreSQL   │ │ Redis        │ │                │
│              │ │              │ │ - DB password  │
│ - Regional   │ │ - Regional   │ │ - API keys     │
│ - Zonal HA   │ │ - 1-30GB     │ │ - OAuth tokens │
│ - pgvector   │ │ - 99.9% SLA  │ │                │
│ - pgBackrest │ │              │ │ - Audit log    │
│              │ │              │ │ - Auto secret  │
└──────────────┘ └──────────────┘ │  rotation      │
                                   └────────────────┘

Additional Services:
┌──────────────────────────────────────────────────────────┐
│ Cloud Logging        - Structured logs (JSON)            │
│ Cloud Monitoring     - Metrics, dashboards, alerts       │
│ Cloud Trace          - Distributed tracing               │
│ Cloud Profiler       - Performance profiling             │
│ Artifact Registry    - Container image storage           │
│ Cloud Build          - CI/CD pipeline automation         │
└──────────────────────────────────────────────────────────┘
```

---

## Request Processing Timeline

```
Time: 0ms ────────────────────────────────────────── 2000ms

│
├─ 0-50ms: ┌─────────────────────────┐
│          │ DNS Lookup + LB routing │
│          └─────────────────────────┘
│
├─ 50-100ms: ┌──────────────┐
│            │ TLS handshake│
│            └──────────────┘
│
├─ 100-150ms: ┌─────────────────────────┐
│             │ Request reaches Cloud Run
│             └─────────────────────────┘
│
├─ 150-250ms: ┌─────────────────────────┐
│             │ Django request processing
│             │ Auth verification       │
│             │ Rate limit check        │
│             └─────────────────────────┘
│
├─250-500ms: ┌────────────────────────────┐
│            │ Coordinator intent classify│
│            │ (LLM call - Gemini)       │
│            └────────────────────────────┘
│
├─500-1000ms: ┌─────────────────────────┐
│             │ Sub-agent execution     │
│             │ - DB queries            │
│             │ - LLM tool calls        │
│             │ - External API calls    │
│             └─────────────────────────┘
│
├─1000-1500ms: ┌──────────────────────────┐
│              │ Result aggregation       │
│              │ Response formatting      │
│              │ Serialization            │
│              └──────────────────────────┘
│
└─1500-2000ms: ┌───────────────┐
               │ Send response │
               └───────────────┘

P50: ~300ms  (fast path, cache hit)
P95: ~1000ms (normal execution)
P99: ~2000ms (slow query or external API)
```

---

## Scaling Behavior

```
           Requests per second
               ↑
               │                ╱─────────────
               │              ╱
               │            ╱ Cloud Run
               │          ╱   auto-scales
               │        ╱
               │      ╱
               │────────────────→ Time
               
Cloud Run handles:
- 0 rps    → 0 instances (free!)
- 10 rps   → 1 instance
- 100 rps  → 10 instances
- 1000 rps → 100 instances (max)

Each instance handles ~100 concurrent requests
```

---

## Error Handling Flow

```
Request hits error
        ↓
┌─────────────────────────────┐
│ Error Type?                 │
└────────┬────────┬────────┬──┘
         │        │        │
    Auth  │     Rate   │   DB
    Error │     Limit  │   Error
    (401) │     (429)  │   (5xx)
         │        │        │
         ▼        ▼        ▼
     Return  Enqueue    Retry with
     Error   for later  exponential
               retry    backoff
                           │
                           ├─ Retry 1: 100ms
                           ├─ Retry 2: 500ms
                           ├─ Retry 3: 2s
                           └─ Fail: return error
```

---

## Monitoring Dashboard Metrics

```
Real-time Metrics:
┌──────────────────────────────────────────┐
│ Request Rate: 150 req/sec        ↗       │
│ Error Rate: 0.5%                         │
│ P95 Latency: 820ms               ↘       │
│ Active Instances: 3              →       │
├──────────────────────────────────────────┤
│ Database:                                │
│ - Connections: 45/100                   │
│ - Queries/sec: 200                      │
│ - Cache hit rate: 78%                   │
├──────────────────────────────────────────┤
│ Agents:                                  │
│ - TaskAgent: 98% success                │
│ - CalendarAgent: 95% success            │
│ - NotesAgent: 99% success               │
├──────────────────────────────────────────┤
│ Intent Classification:                   │
│ - Accuracy: 94%                         │
│ - Avg confidence: 0.89                  │
│ - Misclassifications: 2                 │
└──────────────────────────────────────────┘
```

---

## Complexity Levels at a Glance

```
┌─ LEVEL 1 (MVP) ──────────────────────┐
│ Agents: Task only                    │
│ DB: Single task table                │
│ Code: ~500 lines                     │
│ Time: 5 days                         │
│ Cost: $12-15/month                   │
│ Deployment: 1 Cloud Run instance     │
└──────────────────────────────────────┘
       ↓ (add features)
┌─ LEVEL 2 (Core) ──────────────────────┐
│ Agents: Task + Calendar + Notes      │
│ DB: 3 tables + Redis                 │
│ Code: ~2000 lines                    │
│ Time: 2-3 weeks                      │
│ Cost: $50-65/month                   │
│ Deploy: Cloud Run + SQL + Redis      │
└──────────────────────────────────────┘
       ↓ (add enterprise features)
┌─ LEVEL 3 (Production) ────────────────┐
│ Agents: All + extensibility          │
│ DB: Full schema + pgvector           │
│ Code: ~5000 lines                    │
│ Time: 4-6 weeks                      │
│ Cost: $100-200+/month                │
│ Deploy: Full GCP stack + monitoring  │
└──────────────────────────────────────┘
```

---

## Decision Tree: Which Level?

```
                Start
                 │
         Need quick demo?
         /               \
       YES               NO
        │                │
        ▼                ▼
    Build LEVEL 1    Have team?
    (5 days)    /          \
              <2?          2+?
              │            │
              ▼            ▼
          L1+ Build      Build LEVEL 2
          later         (2-3 weeks)
                              │
                         Enterprise?
                         /           \
                       YES            NO
                        │             │
                        ▼             ▼
                   Build LEVEL 3   Deploy LEVEL 2
                  (4-6 weeks)     to production
```

---

## File Organization

```
productivity-assistant/
├── README.md (overview)
├── PROJECT_SUMMARY.md (this level)
├── MULTI_AGENT_PRODUCTIVITY_DESIGN.md (full design)
├── QUICK_IMPLEMENTATION_GUIDE.md (how-to)
├── GCP_SIMPLIFICATION_STRATEGY.md (levels + MVP)
│
├── apps/backend/
│   ├── mcp_server.py (FastMCP entry)
│   ├── manage.py (Django)
│   ├── requirements.txt
│   │
│   ├── ai_engine/
│   │   ├── models.py (Task, Note, Event)
│   │   ├── views.py (REST API)
│   │   ├── urls.py
│   │   │
│   │   ├── agents/
│   │   │   ├── coordinator.py
│   │   │   ├── task_agent.py
│   │   │   ├── calendar_agent.py
│   │   │   └── notes_agent.py
│   │   │
│   │   └── tools/
│   │       ├── task_tools.py (MCP tools)
│   │       ├── calendar_tools.py
│   │       └── notes_tools.py
│   │
│   └── rag_backend/
│       ├── settings.py
│       ├── urls.py
│       └── wsgi.py
│
├── apps/frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── AgentPanel.jsx
│   │   │   ├── TaskList.jsx
│   │   │   ├── Calendar.jsx
│   │   │   └── Notes.jsx
│   │   └── hooks/
│   │       └── useAgent.js (API integration)
│   │
│   └── package.json
│
├── Dockerfile
├── docker-compose.yml
├── cloudbuild.yaml
│
└── tests/
    ├── test_task_agent.py
    ├── test_calendar_agent.py
    ├── test_notes_agent.py
    ├── test_coordinator.py
    ├── test_integration.py
    └── load_test.py
```

---

**Go to PROJECT_SUMMARY.md for next steps!**
