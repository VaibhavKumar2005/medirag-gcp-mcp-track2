# Multi-Agent Productivity Assistant System
## Comprehensive Design & GCP Implementation Guide

**Project Status:** Design Document | **Target Platform:** Google Cloud Platform  
**Based on:** MediRAG GCP Track 2 Architecture  
**Last Updated:** March 2026

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Core Architecture](#core-architecture)
3. [Multi-Agent System Design](#multi-agent-system-design)
4. [MCP Tools Integration](#mcp-tools-integration)
5. [Database Schema](#database-schema)
6. [Workflow Examples](#workflow-examples)
7. [GCP Deployment Strategy](#gcp-deployment-strategy)
8. [Simplification Options](#simplification-options)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Problem Statement

**Challenge:** Users need an intelligent system to manage:
- Task scheduling and execution
- Calendar/meeting coordination
- Note-taking and information retrieval
- Priority management and deadline tracking
- Cross-functional workflow orchestration

**Current Limitation:** Single-agent systems can't handle complex, multi-step workflows that require:
- Coordination between different domains (tasks, calendar, notes)
- Real-time decision-making across multiple data sources
- Verification and validation steps
- Fallback handling and error recovery

**Solution:** Build a multi-agent system where:
1. A **Coordinator Agent** orchestrates sub-agents
2. Specialized **Sub-Agents** handle specific domains
3. **MCP Tools** bridge AI agents to external services
4. **Structured Data** enables persistent state management

---

## Core Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React/Vite)                    │
│                     Dashboard + Agent Panel                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────▼────────────────────────────────────────┐
│                    FastAPI Gateway Layer                        │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  Authentication (JWT) │ Rate Limiting │ Request Routing  │  │
│   └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
    ┌───▼────┐      ┌────▼─────┐      ┌───▼────┐
    │ Coord.  │      │ MCP HTTP │      │ Django │
    │ Agent   │◄────►│ Transport │◄────►│ Views  │
    │ (FastMCP)     │   Layer   │      │        │
    └────┬────┘      └──────────┘      └───┬────┘
         │                                   │
    ┌────▼─────────────────────────────────▼────┐
    │         Sub-Agent Cluster (async)         │
    │ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
    │ │ Task     │ │ Calendar │ │ Notes    │   │
    │ │ Agent    │ │ Agent    │ │ Agent    │   │
    │ └──────┬───┘ └────┬─────┘ └────┬─────┘   │
    └────────┼──────────┼─────────────┼────────┘
             │          │             │
    ┌────────▼──────────▼─────────────▼────────┐
    │         MCP Tools Layer                  │
    │  ┌─────────────┬────────────┬──────────┐ │
    │  │  Task Mgmt  │  Calendar  │ Notes DB │ │
    │  │   Tools     │   Tools    │  Tools   │ │
    │  └──────┬──────┴──────┬─────┴────┬─────┘ │
    └─────────┼─────────────┼──────────┼───────┘
              │             │          │
    ┌─────────▼─────────────▼──────────▼───────┐
    │    Data Access Layer (ORM + Queries)     │
    └───────────────────────────┬──────────────┘
                                │
    ┌───────────────────────────▼──────────────┐
    │      PostgreSQL + pgvector Database      │
    │  ┌──────────────────────────────────┐   │
    │  │  Tasks  │ Calendar │ Notes │     │   │
    │  │  Workflows │ Events │ Attachments   │
    │  └──────────────────────────────────┘   │
    └────────────────────────────────────────┘
```

### Key Components

| Component | Purpose | Technology |
|-----------|---------|-----------|
| **Coordinator Agent** | Orchestrates workflow, routes requests to sub-agents | FastMCP + Google Gemini 1.5 |
| **Sub-Agents** | Domain-specific logic (tasks, calendar, notes) | FastMCP tools, async workers |
| **MCP HTTP Transport** | Enables AI models to invoke tools | fastmcp >= 2.0 |
| **Django Views** | Legacy RAG API layer + new agent endpoints | djangorestframework |
| **PostgreSQL** | Persistent storage with pgvector for embeddings | Primary DB |
| **Redis** (optional) | Caching, rate limiting, session state | Cache layer |
| **GCP Services** | Secrets, storage, logging, monitoring | Cloud-native integration |

---

## Multi-Agent System Design

### 1. Coordinator Agent (Primary Orchestrator)

**Role:** Central decision-maker that:
- Accepts user requests (natural language)
- Breaks down complex tasks into sub-tasks
- Routes requests to appropriate sub-agents
- Aggregates responses
- Handles error recovery

**Responsibilities:**
```python
class CoordinatorAgent:
    """
    Primary agent responsible for:
    1. Intent classification (task, calendar, notes, generic)
    2. Sub-agent routing and coordination
    3. Multi-step workflow orchestration
    4. Response aggregation and formatting
    5. Error handling and fallback logic
    """
    
    async def handle_request(self, user_input: str, user_id: str) -> dict:
        # 1. Classify intent using LLM
        intent = await self.classify_intent(user_input)
        
        # 2. Route to appropriate sub-agent(s)
        if intent.type == "multi-domain":
            # Complex workflow requiring multiple agents
            results = await self.coordinate_multi_agent_workflow(
                user_input, intent.sub_domains
            )
        else:
            # Single-domain task
            results = await self.routes[intent.domain].execute(user_input)
        
        # 3. Verify and format response
        verified = await self.verify_response(results, user_input)
        
        return {
            "status": "success",
            "intent": intent.dict(),
            "results": verified,
            "confidence": intent.confidence,
            "trace_id": get_trace_id(),
        }
    
    async def classify_intent(self, text: str) -> IntentClassification:
        """Use LLM to determine intent type and routing"""
        prompt = f"""
        Classify this user request into one or more categories:
        - TASK: Create, update, prioritize, or complete tasks
        - CALENDAR: Schedule, reschedule, or check meetings/events
        - NOTES: Create, retrieve, or organize notes
        - WORKFLOW: Multi-step process across multiple domains
        - QUERY: Information retrieval or summarization
        
        Request: {text}
        
        Respond with:
        {{
            "primary_intent": "TASK|CALENDAR|NOTES|WORKFLOW|QUERY",
            "secondary_intents": [],
            "confidence": 0.0-1.0,
            "entities": {{"dates": [], "people": [], "keywords": []}},
            "requires_verification": bool,
            "urgency": "low|medium|high|critical"
        }}
        """
        
        result = await self.llm.generate(prompt)
        return IntentClassification.parse_obj(json.loads(result))
```

**Decision Logic:**

```
User Request
    ↓
┌─ Classify Intent ─┐
│ (NLP + Pattern)   │
└────────┬──────────┘
         ↓
    Is Complex?
    /          \
   NO          YES
   │            │
   │        ┌─ Identify Sub-Tasks ─┐
   │        │ (LLM decomposition)   │
   │        └──────┬────────────────┘
   │               ↓
   │        Plan Execution Order
   │               ↓
   ├─────► Parallel or Sequential?
   │        /              \
   ├──────PARALLEL         SEQUENTIAL
   │      (async)          (ordered)
   │        │               │
   └──────► Execute Sub-Agents ──────┐
            │                        │
            ├─ TaskAgent             │
            ├─ CalendarAgent         │
            └─ NotesAgent            │
                                     ↓
                            Aggregate Results
                                     ↓
                            Verify Consistency
                                     ↓
                            Format Response
```

### 2. Task Management Agent (Sub-Agent)

**Tools:**
- `create_task(title, description, due_date, priority, assignee)`
- `update_task(task_id, fields_to_update)`
- `list_tasks(filter: urgent, due_today, by_assignee, by_project)`
- `complete_task(task_id, completion_notes)`
- `prioritize_tasks(task_ids, new_priority_order)`

**Workflow:**
```
"Create a high-priority bug fix task due tomorrow"
    ↓
parse_intent: CREATE_TASK
extract_entities: 
  - title: "bug fix"
  - priority: "high"
  - due_date: tomorrow
    ↓
→ create_task_in_db()
→ notify_user()
→ update_project_metrics()
    ↓
response: {task_id, status, created_at, due_date}
```

### 3. Calendar Agent (Sub-Agent)

**Tools:**
- `find_free_slots(start_date, end_date, min_duration, attendees)`
- `schedule_meeting(title, participants, start_time, duration, location)`
- `check_conflicts(proposed_time, duration, attendees)`
- `reschedule_event(event_id, new_time)`
- `list_events(date_range, filter_by_organizer)`
- `synthesize_schedule(date, include_focus_time)`

**Example Workflow:**
```
"Schedule a 1-hour meeting with Alice and Bob next week"
    ↓
extract_entities:
  - duration: 60 min
  - attendees: ["alice", "bob"]
  - time_window: "next week"
    ↓
call find_free_slots(
  start: Mon next week,
  end: Fri next week,
  duration: 60,
  attendees: ["alice", "bob"]
)
    ↓
received slots: [
  {Mon 2pm, Alice+Bob free},
  {Wed 10am, Alice+Bob free},
  {Thu 3pm, Alice+Bob free}
]
    ↓
recommend best slot (least context-switching)
    ↓
schedule_meeting()
→ send calendar invites
→ add to all attendee calendars (GCP Calendar API)
    ↓
response: {event_id, confirmed_time, attendees, status}
```

### 4. Notes & Information Agent (Sub-Agent)

**Tools:**
- `create_note(title, content, tags, category, is_pinned)`
- `search_notes(query, filters: tags, date_range, category)`
- `retrieve_note(note_id)`
- `link_note_to_task(note_id, task_id)`
- `generate_summary(note_ids, summarization_style)`
- `organize_notes(tag_strategy, category_suggestions)`

**Example Workflow:**
```
"Create a note about Q2 planning and link it to the strategic planning task"
    ↓
extract_entities:
  - note_content: "Q2 planning discussion"
  - linked_task: "strategic planning"
    ↓
create_note(
  title: "Q2 Planning Notes",
  content: user_input,
  tags: ["planning", "q2"],
  category: "strategic"
)
    ↓
find_task(title_contains: "strategic planning")
    ↓
link_note_to_task(note_id, task_id)
    ↓
response: {note_id, task_link, created_at, tags}
```

### Multi-Agent Coordination Patterns

#### Pattern 1: Sequential Workflow
```
Schedule Meeting + Add Note + Create Follow-up Task

User: "Schedule a client call next Tuesday 2pm, add notes, and create a follow-up task"

Coordinator executes:
1. CalendarAgent.schedule_meeting("client call", "next Tuesday 2pm")
   → event_id: EVT-001
   
2. NotesAgent.create_note("Client Call - Next Tuesday")
   → note_id: NOTE-101
   
3. TaskAgent.create_task(
     "Follow up on client call action items",
     due_date: "next Wednesday",
     linked_event: event_id,
     linked_note: note_id
   )
   → task_id: TASK-503
   
Response: {event_id, note_id, task_id, status: "success"}
```

#### Pattern 2: Parallel Workflow with Aggregation
```
Prepare for Weekly Standup

User: "Give me a standup report - summarize this week's completed tasks, 
       highlight any blocking issues, check my calendar conflicts, 
       and find free slots to reschedule blocked meetings"

Coordinator executes in parallel:
1. TaskAgent.list_tasks(filter: completed, date_range: this_week)
   ↓ return: [task_id_1, task_id_2, task_id_3]
   
2. TaskAgent.list_tasks(filter: blocked, date_range: this_week)
   ↓ return: [task_id_blocked_1, task_id_blocked_2]
   
3. CalendarAgent.list_events(date_range: this_week)
   ↓ return: [event_1, event_2, ...]
   
4. NotesAgent.search_notes(tags: ["blockers", "this_week"])
   ↓ return: [note_1, note_2]

Then aggregate:
- Generate summary from completed tasks
- Identify conflicts from calendar
- Find free slots for rescheduling
- Cross-reference with blocker notes

Response:
{
    "completed_tasks": [...],
    "blocking_issues": [...],
    "calendar_conflicts": [...],
    "free_slots_for_rescheduling": [...],
    "standup_summary": "generated summary",
    "recommended_actions": [...]
}
```

#### Pattern 3: Decision-Based Routing
```
Smart Task Prioritization

User: "Prioritize my tasks for tomorrow based on calendar availability"

Coordinator:
1. CalendarAgent.list_events(date: tomorrow)
   → focus_blocks: 
     - 9am-11am: Deep work
     - 2pm-3pm: Open
     - 4pm-5pm: Focus
     - Rest: Meetings/breaks
   
2. TaskAgent.list_tasks(filter: due_tomorrow_or_overdue)
   → [task_1, task_2, task_3, task_4, task_5]
   
3. For each task, estimate duration based on historical data
   
4. Use LLM to optimize allocation:
   - Assign deep-work tasks to 9am-11am block
   - Check task dependencies/ordering
   - Balance cognitive load
   
Response:
{
    "schedule_for_tomorrow": [
        {"9am-11am": [task_1, task_2], "type": "deep_work"},
        {"2pm-3pm": [task_3], "type": "flexible"},
        ...
    ],
    "rationale": "explanation of prioritization",
    "estimated_completion": 95%
}
```

---

## MCP Tools Integration

### MCP Tool Architecture

```
┌─────────────────────────────────────────────────────────┐
│         MCP Tool Definitions (FastMCP)                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ @mcp.tool() decorator marks each function as    │   │
│  │ callable by LLM through MCP protocol            │   │
│  │                                                  │   │
│  │ Tool Signature:                                 │   │
│  │ - Tool name (for LLM to identify)              │   │
│  │ - Input schema (JSON Schema)                   │   │
│  │ - Output format (structured response)          │   │
│  │ - Error handling (fallback behavior)           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  When LLM calls tool:                                   │
│  1. MCP protocol receives function call request         │
│  2. Validate inputs against schema                      │
│  3. Execute tool implementation                         │
│  4. Return structured result to LLM                     │
│  5. LLM uses result to generate next action             │
└─────────────────────────────────────────────────────────┘
```

### Task Management Tools Implementation

```python
# mcp_server.py - Task Management Tools

from fastmcp import FastMCP
from pydantic import BaseModel, Field

mcp = FastMCP(name="productivity-assistant", version="1.0.0")

@mcp.tool()
def create_task(
    title: str = Field(..., description="Task title"),
    description: str = Field("", description="Detailed description"),
    due_date: str = Field(None, description="Due date (YYYY-MM-DD)"),
    priority: str = Field("medium", description="Priority: low|medium|high|critical"),
    assignee_id: str = Field(None, description="User ID of assignee"),
    tags: list[str] = Field([], description="Tags for categorization"),
) -> dict:
    """
    Create a new task in the system.
    
    Returns: {task_id, status, created_at, due_date, priority, assignee}
    """
    try:
        # 1. Validate inputs
        assert title.strip(), "Title cannot be empty"
        if due_date:
            assert validate_date(due_date), "Invalid date format"
        assert priority in ["low", "medium", "high", "critical"]
        
        # 2. Create task in database
        task = Task.objects.create(
            title=title,
            description=description,
            due_date=due_date,
            priority=priority,
            assignee_id=assignee_id,
            created_by=current_user(),
            status="open",
            tags=tags
        )
        
        # 3. Create activity log entry
        ActivityLog.objects.create(
            task_id=task.id,
            action="created",
            user_id=current_user().id
        )
        
        # 4. Notify assignee if different from creator
        if assignee_id and assignee_id != current_user().id:
            notify_user(assignee_id, f"New task assigned: {title}")
        
        # 5. Return structured response
        return {
            "status": "success",
            "task_id": task.id,
            "title": task.title,
            "created_at": task.created_at.isoformat(),
            "due_date": task.due_date,
            "priority": task.priority,
            "assignee_id": task.assignee_id
        }
    
    except Exception as e:
        logger.error(f"create_task error: {e}")
        return {"status": "error", "error": str(e)}


@mcp.tool()
def list_tasks(
    filter_by: str = Field("all", description="Filter: all|due_today|overdue|urgent|assigned_to_me"),
    date_range: str = Field(None, description="Date range: week|month|quarter"),
    sort_by: str = Field("priority", description="Sort: priority|due_date|created_at|status"),
) -> dict:
    """
    List tasks with filters and sorting.
    
    Returns: {tasks: [{id, title, priority, due_date, status, assignee}], count}
    """
    try:
        query = Task.objects.filter(project_id=current_project_id())
        
        # Apply filters
        if filter_by == "due_today":
            query = query.filter(due_date=today())
        elif filter_by == "overdue":
            query = query.filter(due_date__lt=today(), status!="completed")
        elif filter_by == "urgent":
            query = query.filter(priority__in=["high", "critical"])
        elif filter_by == "assigned_to_me":
            query = query.filter(assignee_id=current_user().id)
        
        # Apply date range
        if date_range == "week":
            query = query.filter(due_date__gte=today(), due_date__lte=today()+timedelta(days=7))
        elif date_range == "month":
            query = query.filter(due_date__month=today().month)
        
        # Sort
        if sort_by == "priority":
            priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            query = query.annotate(priority_rank=Case(*[
                When(priority=p, then=Value(r)) for p, r in priority_order.items()
            ])).order_by('priority_rank', 'due_date')
        else:
            query = query.order_by('-' + sort_by)
        
        tasks = query[:100]  # Pagination limit
        
        return {
            "status": "success",
            "count": query.count(),
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "priority": t.priority,
                    "due_date": t.due_date,
                    "status": t.status,
                    "assignee_id": t.assignee_id,
                    "tags": t.tags
                }
                for t in tasks
            ]
        }
    
    except Exception as e:
        logger.error(f"list_tasks error: {e}")
        return {"status": "error", "error": str(e)}


@mcp.tool()
def complete_task(
    task_id: str = Field(..., description="Task ID"),
    completion_notes: str = Field("", description="Optional notes on completion"),
) -> dict:
    """
    Mark a task as complete.
    
    Returns: {task_id, status, completed_at, impact_score}
    """
    try:
        task = Task.objects.get(id=task_id)
        
        # Update task
        task.status = "completed"
        task.completed_at = now()
        task.completion_notes = completion_notes
        task.save()
        
        # Cascade: mark any dependent tasks as unblocked
        dependent_tasks = Task.objects.filter(blocked_by_task_id=task_id)
        for dep_task in dependent_tasks:
            dep_task.status = "ready"
            dep_task.save()
            notify_user(dep_task.assignee_id, f"Task '{dep_task.title}' is now unblocked")
        
        # Update metrics
        user_completion_rate = calculate_completion_rate(current_user())
        
        return {
            "status": "success",
            "task_id": task.id,
            "completed_at": task.completed_at.isoformat(),
            "user_completion_rate": user_completion_rate,
            "unblocked_tasks": dependent_tasks.count()
        }
    
    except Exception as e:
        logger.error(f"complete_task error: {e}")
        return {"status": "error", "error": str(e)}


@mcp.tool()
def search_tasks(
    query: str = Field(..., description="Search query (title, description, tags)"),
    limit: int = Field(10, description="Max results"),
) -> dict:
    """
    Full-text search across tasks.
    
    Uses PostgreSQL full-text search + semantic similarity via pgvector
    
    Returns: {results: [{id, title, relevance_score}], total}
    """
    try:
        # Full-text search
        ft_results = Task.objects.filter(
            Q(title__icontains=query) | Q(description__icontains=query)
        ).annotate(
            search_rank=SearchRank(SearchVector('title', weight='A') + SearchVector('description', weight='B'), 
                                   SearchQuery(query))
        ).order_by('-search_rank')[:limit]
        
        # Semantic search (optional, if embeddings enabled)
        semantic_results = []
        if settings.ENABLE_SEMANTIC_SEARCH:
            embed = get_embeddings(query)
            semantic_results = Task.objects.annotate(
                similarity=CosineDistance('embedding', embed)
            ).order_by('similarity')[:limit]
        
        # Combine and deduplicate
        all_results = list(set([r.id for r in ft_results] + [r.id for r in semantic_results]))[:limit]
        
        return {
            "status": "success",
            "results": [
                {
                    "id": t.id,
                    "title": t.title,
                    "relevance_score": calculate_relevance(t, query)
                }
                for t in Task.objects.filter(id__in=all_results)
            ],
            "total": len(all_results)
        }
    
    except Exception as e:
        logger.error(f"search_tasks error: {e}")
        return {"status": "error", "error": str(e)}
```

### Calendar Tools Implementation

```python
# Calendar tools follow similar pattern

@mcp.tool()
def find_free_slots(
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Field(..., description="End date (YYYY-MM-DD)"),
    duration_minutes: int = Field(60, description="Required duration in minutes"),
    attendees: list[str] = Field([], description="List of attendee emails"),
    exclude_work_hours: bool = Field(False, description="Only non-working-hours slots"),
) -> dict:
    """
    Find free meeting slots considering all attendees' calendars.
    
    Integrates with GCP Calendar API for multi-user scheduling.
    
    Returns: {slots: [{start_time, end_time, confidence_score}], best_slot}
    """
    try:
        from google.cloud import calendar_v1
        
        # Get all calendars
        all_calendars = [current_user().email] + attendees
        
        # Query availability for each attendee
        availability = {}
        for email in all_calendars:
            cal_service = get_calendar_service()
            events = cal_service.events().list(
                calendarId=email,
                timeMin=start_date + "T00:00:00",
                timeMax=end_date + "T23:59:59",
                items=['transparency', 'summary', 'start', 'end'],
            ).execute()
            availability[email] = events.get('items', [])
        
        # Find overlapping free slots
        free_slots = calculate_free_slots(
            availability=availability,
            date_range=(start_date, end_date),
            duration=duration_minutes,
            exclude_work_hours=exclude_work_hours
        )
        
        # Score and rank slots
        ranked_slots = rank_slots_by_context_switching(
            free_slots,
            current_user(),
            attendees
        )
        
        return {
            "status": "success",
            "slots": ranked_slots[:5],
            "best_slot": ranked_slots[0] if ranked_slots else None
        }
    
    except Exception as e:
        logger.error(f"find_free_slots error: {e}")
        return {"status": "error", "error": str(e)}


@mcp.tool()
def schedule_meeting(
    title: str = Field(..., description="Meeting title"),
    start_time: str = Field(..., description="Start time (YYYY-MM-DDTHH:MM:SS)"),
    duration_minutes: int = Field(60, description="Duration in minutes"),
    attendees: list[str] = Field([], description="Attendee emails"),
    description: str = Field("", description="Meeting description"),
    location: str = Field("", description="Physical or virtual location"),
) -> dict:
    """
    Schedule a meeting and send invites to all attendees.
    
    Returns: {event_id, status, invites_sent, calendar_urls}
    """
    try:
        from google.cloud import calendar_v1
        
        # Calculate end time
        end_time = (
            datetime.fromisoformat(start_time) + 
            timedelta(minutes=duration_minutes)
        ).isoformat()
        
        # Create calendar event
        cal_service = get_calendar_service()
        event = {
            'summary': title,
            'description': description,
            'start': {'dateTime': start_time, 'timeZone': get_user_timezone()},
            'end': {'dateTime': end_time, 'timeZone': get_user_timezone()},
            'attendees': [{'email': att} for att in attendees],
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},
                    {'method': 'popup', 'minutes': 15}
                ]
            },
            'conferenceData': {
                'conferenceType': 'hangoutsMeet'
            }
        }
        
        if location:
            event['location'] = location
        
        # Insert event
        created_event = cal_service.events().insert(
            calendarId=current_user().email,
            body=event,
            conferenceDataVersion=1,
            sendNotifications=True
        ).execute()
        
        # Store in local database for reference
        CalendarEvent.objects.create(
            gcal_event_id=created_event['id'],
            user_id=current_user().id,
            title=title,
            start_time=start_time,
            duration_minutes=duration_minutes,
            attendees=attendees
        )
        
        return {
            "status": "success",
            "event_id": created_event['id'],
            "calendar_url": created_event.get('htmlLink'),
            "meet_link": created_event.get('conferenceData', {}).get('entryPoints', [{}])[0].get('uri'),
            "invites_sent": len(attendees)
        }
    
    except Exception as e:
        logger.error(f"schedule_meeting error: {e}")
        return {"status": "error", "error": str(e)}
```

---

## Database Schema

### Core Tables

```sql
-- Tasks table
CREATE TABLE ai_engine_task (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES auth_user(id),
    project_id UUID NOT NULL,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'open',  -- open, in_progress, completed, blocked, cancelled
    priority VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    
    assignee_id INTEGER REFERENCES auth_user(id),
    created_by_id INTEGER NOT NULL REFERENCES auth_user(id),
    
    blocked_by_task_id UUID REFERENCES ai_engine_task(id),
    
    tags JSONB DEFAULT '[]',
    metadata JSONB,
    
    created_index BIGSERIAL,
    
    CONSTRAINT valid_status CHECK (status IN ('open', 'in_progress', 'completed', 'blocked', 'cancelled')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_task_user_status ON ai_engine_task(user_id, status);
CREATE INDEX idx_task_due_date ON ai_engine_task(due_date);
CREATE INDEX idx_task_assignee ON ai_engine_task(assignee_id);
CREATE INDEX idx_task_project ON ai_engine_task(project_id);


-- Calendar events table
CREATE TABLE ai_engine_calendar_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES auth_user(id),
    
    gcal_event_id VARCHAR(255),  -- External Google Calendar ID
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    
    location VARCHAR(255),
    meet_link VARCHAR(255),
    
    organizer_id INTEGER REFERENCES auth_user(id),
    attendees JSONB DEFAULT '[]',  -- [{email, status, response_time}]
    
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule VARCHAR(255),  -- RFC 5545 RRULE format
    
    calendar_type VARCHAR(50) DEFAULT 'work',  -- work, personal, focus, break
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    metadata JSONB
);

CREATE INDEX idx_calendar_user ON ai_engine_calendar_event(user_id, start_time);
CREATE INDEX idx_calendar_gcal_id ON ai_engine_calendar_event(gcal_event_id);


-- Notes table
CREATE TABLE ai_engine_note (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES auth_user(id),
    
    title VARCHAR(255) NOT NULL,
    content TEXT,
    summary TEXT,  -- AI-generated summary for quick reference
    
    category VARCHAR(50),  -- work, personal, research, ideas, etc.
    is_pinned BOOLEAN DEFAULT false,
    
    tags JSONB DEFAULT '[]',
    
    linked_tasks JSONB DEFAULT '[]',  -- [task_id, task_id, ...]
    linked_events JSONB DEFAULT '[]',  -- [event_id, event_id, ...]
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- For semantic search
    embedding vector(768),  -- Using pgvector
    
    metadata JSONB
);

CREATE INDEX idx_note_user ON ai_engine_note(user_id, created_at);
CREATE INDEX idx_note_tags ON ai_engine_note USING GIN(tags);
CREATE INDEX idx_note_embedding ON ai_engine_note USING ivfflat(embedding vector_cosine_ops);


-- Agent workflow execution history
CREATE TABLE ai_engine_workflow_execution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES auth_user(id),
    
    workflow_type VARCHAR(100),  -- "schedule_meeting", "prioritize_tasks", "standup_preparation"
    status VARCHAR(20) DEFAULT 'pending',  -- pending, in_progress, completed, failed
    
    user_input TEXT NOT NULL,
    
    classifier_intent JSONB,  -- Intent classification result
    classified_confidence DECIMAL(3,2),
    
    planned_actions JSONB,  -- Planned sub-agent calls
    executed_actions JSONB,  -- Actual execution trace
    
    coordinator_response JSONB,
    
    start_time TIMESTAMPTZ DEFAULT now(),
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- For debugging and verification
    trace_id VARCHAR(255),
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workflow_user_status ON ai_engine_workflow_execution(user_id, status);
CREATE INDEX idx_workflow_type ON ai_engine_workflow_execution(workflow_type);


-- Coordination ledger (for multi-agent transactions)
CREATE TABLE ai_engine_agent_coordination (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES ai_engine_workflow_execution(id),
    
    parent_agent VARCHAR(100),
    child_agent VARCHAR(100),
    
    request_payload JSONB,
    response_payload JSONB,
    
    status VARCHAR(20),  -- pending, completed, failed
    error_message TEXT,
    
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_coordination_workflow ON ai_engine_agent_coordination(workflow_id);
```

### Indexes for Performance

```sql
-- For workflow queries
CREATE INDEX idx_workflow_user_created ON ai_engine_workflow_execution(user_id, created_at DESC);

-- For task filtering
CREATE INDEX idx_task_multi ON ai_engine_task(user_id, status, priority, due_date);

-- For event availability queries
CREATE INDEX idx_calendar_date_range ON ai_engine_calendar_event(user_id, start_time, end_time);

-- For semantic search on notes
CREATE INDEX idx_note_semantic ON ai_engine_note USING ivfflat(embedding);
```

---

## Workflow Examples

### Example 1: Weekly Planning Workflow

**User Request:**
```
"Prepare me for next week - check my calendar for conflicts, 
create a priority list of tasks, and suggest focus blocks"
```

**Coordinator Execution Flow:**

```
┌─ Parse Request ────────────────────────────────────────┐
│ Intent: "WORKFLOW" (Plan for next week)               │
│ Sub-domains: [CALENDAR, TASK, NOTES]                  │
└────────────┬────────────────────────────────────────────┘
             ↓
┌─ Parallel Sub-Agent Calls ─────────────────────────────┐
│                                                         │
│ 1. CalendarAgent.list_events(                          │
│      date_range: "next_week"                           │
│    )                                                    │
│    → [Meeting1, Meeting2, Meeting3, ...]              │
│                                                         │
│ 2. TaskAgent.list_tasks(                               │
│      filter: "due_next_week",                          │
│      sort_by: "priority"                              │
│    )                                                    │
│    → [Task1, Task2, Task3, ...]                       │
│                                                         │
│ 3. NotesAgent.search_notes(                            │
│      tags: ["planning", "next_week"],                  │
│      limit: 5                                          │
│    )                                                    │
│    → [Note1, Note2, ...]                              │
└────────────┬────────────────────────────────────────────┘
             ↓
┌─ LLM Analysis & Aggregation ───────────────────────────┐
│                                                         │
│ Prompt to Coordinator LLM:                             │
│ "Given these calendar events, tasks, and notes,        │
│  provide a comprehensive weekly plan including:        │
│  1. Calendar conflicts and resolution suggestions      │
│  2. Task priority ranking                              │
│  3. Recommended focus blocks                           │
│  4. Risk assessment for deadlines"                     │
│                                                         │
│ LLM generates:                                         │
│ - Conflict resolution recommendations                  │
│ - Priority-optimized task order                        │
│ - Suggested focus time blocks                          │
│ - Risk flags and mitigation strategies                │
└────────────┬────────────────────────────────────────────┘
             ↓
┌─ Execute Follow-up Actions─────────────────────────────┐
│                                                         │
│ If needed:                                             │
│ - Suggest rescheduling conflicts                       │
│ - Create focus-time blocks on calendar                 │
│ - Create high-priority tasks as calendar blocks        │
│ - Update notes with new insights                       │
└────────────┬────────────────────────────────────────────┘
             ↓
┌─ Format Response ──────────────────────────────────────┐
│                                                         │
│ {                                                       │
│   "status": "success",                                 │
│   "weekly_plan": {                                     │
│     "conflicts": [...],                                │
│     "priority_tasks": [...],                           │
│     "focus_blocks": [...],                             │
│     "risk_assessment": {...}                           │
│   },                                                    │
│   "recommended_actions": [                             │
│     "Reschedule meeting X to Y",                       │
│     "Block 9-11am for deep work",                      │
│     "Task ABC is at risk, start today"                │
│   ],                                                    │
│   "execution_time_ms": 2340,                           │
│   "trace_id": "trace-12345"                            │
│ }                                                       │
└────────────────────────────────────────────────────────┘
```

**API Endpoint:**
```
POST /api/agent/workflows/weekly-planning
{
  "user_id": "user-123",
  "date_range": "next_week"
}

→ 200 OK
{
  "workflow_id": "wf-001",
  "status": "success",
  "weeklyPlan": {...},
  "executedAt": "2026-03-30T10:30:00Z"
}
```

### Example 2: Meeting Scheduling Workflow

**User Request:**
```
"Schedule a 1-hour sprint planning meeting with Alice, Bob, and Charlie 
for next week. Find the best time that works for everyone and add a 
note with the sprint goals."
```

**Execution:**

```
1. CalendarAgent.find_free_slots(
     attendees: ["alice@, bob@, charlie@"],
     duration: 60,
     date_range: "next_week"
   )
   → Slots: [Mon 10am, Wed 2pm, Thu 3pm]

2. Use LLM to select best slot
   → "Wed 2pm (least context-switching for team)"

3. CalendarAgent.schedule_meeting(
     title: "Sprint Planning",
     start_time: "2026-04-02T14:00:00",
     duration: 60,
     attendees: ["alice@, bob@, charlie@"]
   )
   → event_id: "evt-789"

4. NotesAgent.create_note(
     title: "Sprint Planning Meeting - April 2",
     content: "[Add sprint goals here]",
     tags: ["sprint", "planning", "q2"],
     linked_event: "evt-789"
   )
   → note_id: "note-456"

5. TaskAgent.create_task(
     title: "Prepare sprint planning materials",
     due_date: "2026-04-01",  # day before
     description: "Review backlog and create agenda",
     linked_event: "evt-789",
     linked_note: "note-456"
   )
   → task_id: "task-234"

Response:
{
  "status": "success",
  "scheduled": {
    "event_id": "evt-789",
    "title": "Sprint Planning",
    "time": "Wed, April 2 at 2:00 PM",
    "attendees": ["alice@...", "bob@...", "charlie@..."],
    "meet_link": "https://meet.google.com/..."
  },
  "note": {
    "note_id": "note-456",
    "title": "Sprint Planning Meeting - April 2"
  },
  "prep_task": {
    "task_id": "task-234",
    "title": "Prepare sprint planning materials",
    "due_date": "2026-04-01"
  }
}
```

### Example 3: Blocking Issue Resolution Workflow

**User Request:**
```
"Task ABC is blocking tasks D, E, and F. What's the status? 
Can we unblock them? Create a plan."
```

**Execution:**

```
1. TaskAgent.get_task("task-abc")
   → {status: "blocked", blocked_by: "task-xyz", due: "2026-03-31"}

2. TaskAgent.list_tasks(filter: "blocked_by_task_abc")
   → [task-d, task-e, task-f]

3. For each blocking task:
   → Find who's responsible
   → Check calendar for availability
   → Identify holdup reason

4. LLM generates plan:
   → "Contact John (task-xyz owner) to accelerate
      Reschedule review meeting to unblock task-d
      Alternative: parallel path for tasks-e,f"

5. Execute: Create workflow tickets, schedule calls, etc.

Response:
{
  "status": "success",
  "analysis": {
    "root_blocker": "task-xyz",
    "blocked_tasks": ["task-d", "task-e", "task-f"],
    "impact": "3 tasks at risk of missing deadline"
  },
  "recommended_plan": [
    {
      "action": "contact_owner",
      "task": "task-xyz",
      "owner_email": "john@...",
      "suggested_message": "..."
    },
    {
      "action": "reschedule_meeting",
      "current_time": "2026-04-05T10:00",
      "suggested_time": "2026-03-31T15:00"
    },
    {
      "action": "start_parallel_work",
      "tasks": ["task-e", "task-f"],
      "dependencies_resolved": false
    }
  ]
}
```

---

## GCP Deployment Strategy

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GCP Cloud Architecture                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Cloud Load Balancer (Global)                         │   │
│  │ - HTTPS termination                                  │   │
│  │ - Route requests to Cloud Run                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Cloud Run (Managed Serverless)                       │   │
│  │ - Django + DRF API                                   │   │
│  │ - FastMCP server for tools                           │   │
│  │ - Unicorn/Gunicorn workers                           │   │
│  │ - Auto-scaling (0 to N instances)                    │   │
│  │ - Concurrency: 100 req/instance                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                    │
│  ┌─────────────┬──────────────────┬──────────────────────┐  │
│  │             │                  │                      │  │
│  ▼             ▼                  ▼                      ▼  │
│ Cloud SQL    Cloud Memorystore   Cloud Storage   Secret Manager
│ (PostgreSQL) (Redis)             (Doc storage)   (API keys, secrets)
│ + pgvector   - Cache              - Vectors       - DB credentials
│              - Sessions           - Vector index  - OAuth tokens
│              - Rate limits        - Backups       - GCP key files
│              - Task queue                                │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Additional GCP Services                              │   │
│  │ - Vertex AI (LLM alternatives)                       │   │
│  │ - Cloud Calendar API (meeting integration)           │   │
│  │ - Cloud Logging (structured logs)                    │   │
│  │ - Cloud Monitoring + Alert Policy                    │   │
│  │ - Cloud Trace (distributed tracing)                  │   │
│  │ - Cloud Profiler (performance)                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Cloud Run Configuration

```yaml
# cloudrun-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: productivity-assistant
  namespace: default
  labels:
    app: productivity-assistant
    component: api

spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "100"
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/targetUtilizationPercentage: "70"
        client.knative.dev/user-image: "gcr.io/my-project/productivity-assistant:latest"
        
    spec:
      serviceAccountName: productivity-assistant
      
      containers:
      - name: api
        image: gcr.io/my-project/productivity-assistant:latest
        
        ports:
        - name: http1
          containerPort: 8080
        
        resources:
          requests:
            memory: "512Mi"
            cpu: "1000m"
          limits:
            memory: "1Gi"
            cpu: "2000m"
        
        env:
        # Database
        - name: POSTGRES_HOST
          value: "cloudsql-proxy"
        - name: POSTGRES_DB
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: database
        
        # GCP Services
        - name: GCP_PROJECT_ID
          value: "my-gcp-project"
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: "/var/secrets/google/key.json"
        
        # LLM Configuration
        - name: GEMINI_MODEL
          value: "gemini-1.5-flash"
        - name: EMBEDDING_MODEL
          value: "models/text-embedding-004"
        
        # Cache
        - name: REDIS_HOST
          value: "redis-service.default.svc.cluster.local"
        - name: REDIS_PORT
          value: "6379"
        
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        
        volumeMounts:
        - name: google-cloud-key
          mountPath: /var/secrets/google
      
      volumes:
      - name: google-cloud-key
        secret:
          secretName: gcp-service-account-key
```

### Database Setup

```bash
#!/bin/bash
# setup-gcp-infrastructure.sh

PROJECT_ID="your-project-id"
REGION="us-central1"

# 1. Create Cloud SQL PostgreSQL instance
gcloud sql instances create productivity-db \
  --project=$PROJECT_ID \
  --region=$REGION \
  --database-version=POSTGRES_15 \
  --tier=db-custom-2-7680 \
  --storage-size=20GB \
  --storage-auto-increase \
  --availability-type=REGIONAL \
  --backup-start-time=02:00 \
  --enable-bin-log

# 2. Enable pgvector extension
gcloud sql connect productivity-db --project=$PROJECT_ID << EOF
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extname FROM pg_extension;
EOF

# 3. Create databases and users
gcloud sql connect productivity-db --project=$PROJECT_ID << EOF
CREATE DATABASE productivity_db;
CREATE USER app_user WITH PASSWORD 'secure-password-here';
GRANT ALL PRIVILEGES ON DATABASE productivity_db TO app_user;

-- Connect to the new database
\c productivity_db

-- Run Django migrations
ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO app_user;
EOF

# 4. Create Cloud Memorystore (Redis) instance
gcloud redis instances create productivity-cache \
  --project=$PROJECT_ID \
  --region=$REGION \
  --size=2 \
  --redis-version=7.0

# 5. Create Secret Manager entries
gcloud secrets create POSTGRES_PASSWORD \
  --replication-policy="automatic" \
  --data-file=- <<< 'your-secure-password'

gcloud secrets create DJANGO_SECRET_KEY \
  --replication-policy="automatic" \
  --data-file=- <<< 'your-secret-key'

gcloud secrets create GCP_SERVICE_ACCOUNT_KEY \
  --replication-policy="automatic" \
  --data-file=service-account.json
```

### CI/CD Pipeline (Cloud Build)

```yaml
# cloudbuild.yaml
steps:
  # Step 1: Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    id: 'BUILD_IMAGE'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/productivity-assistant:$SHORT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/productivity-assistant:latest'
      - '.'
  
  # Step 2: Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    id: 'PUSH_IMAGE'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/productivity-assistant:$SHORT_SHA'
  
  # Step 3: Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/run'
    id: 'DEPLOY'
    args:
      - 'deploy'
      - 'productivity-assistant'
      - '--region=us-central1'
      - '--image=gcr.io/$PROJECT_ID/productivity-assistant:$SHORT_SHA'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--set-env-vars=DEPLOYMENT_ENV=production'
      - '--max-instances=100'
      - '--memory=1Gi'
      - '--cpu=1'
  
  # Step 4: Run smoke tests
  - name: 'gcr.io/cloud-builders/gke-deploy'
    id: 'TEST'
    args:
      - 'run'
      - '-f'
      - 'tests/smoke/'
      - '-n'
      - 'default'

onFailure:
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'logging'
      - 'write'
      - 'deployment-failures'
      - 'Deployment of productivity-assistant failed'
```

---

## Simplification Options

### Option 1: MVP (Minimum Viable Product)

**Scope:** Single-domain + basic coordination

**Components:**
- ✅ Task Management Agent (core)
- ✅ Simple Coordinator (routes to one sub-agent)
- ❌ Calendar integration (build later)
- ❌ Notes system (build later)
- ✅ PostgreSQL (no pgvector initially)
- ❌ Semantic search

**Database:**
```sql
-- Minimal schema
CREATE TABLE task (id, user_id, title, status, due_date, priority);
CREATE TABLE workflow_run (id, user_id, workflow_type, status, input, output);
```

**Effort:** ~1-2 weeks

**Deployment:**
```bash
# Single Cloud Run instance + Cloud SQL
gcloud run deploy --image gcr.io/...
```

---

### Option 2: Core Multi-Agent (Recommended)

**Scope:** 3 domains + coordinator

**Components:**
- ✅ Task Agent
- ✅ Calendar Agent  
- ✅ Notes Agent
- ✅ Coordinator Agent
- ✅ Redis caching
- ✅ Semantic search via pgvector

**Effort:** ~3-4 weeks

---

### Option 3: Production (Full)

**Scope:** Full system + enterprise features

**Components:**
- ✅ All agents + extensibility
- ✅ Multi-tenancy
- ✅ Advanced RBAC
- ✅ Observability (tracing, metrics)
- ✅ Performance optimization
- ✅ Disaster recovery

**Effort:** ~6-8 weeks

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Set up GCP infrastructure (Cloud SQL, Memorystore, Cloud Run)
- [ ] Create data models (Task, CalendarEvent, Note, WorkflowExecution)
- [ ] Implement Task Agent with MCP tools
- [ ] Build basic Coordinator Agent

**Deliverable:** Working task management with single agent

### Phase 2: Expansion (Week 3-4)

- [ ] Implement Calendar Agent + GCP Calendar API integration
- [ ] Implement Notes Agent + semantic search
- [ ] Build Coordinator routing logic
- [ ] Multi-agent orchestration patterns

**Deliverable:** Full multi-agent coordination working

### Phase 3: Polish (Week 5-6)

- [ ] Add error handling and fallbacks
- [ ] Implement observability (tracing, metrics, logs)
- [ ] Performance optimization
- [ ] Security hardening

**Deliverable:** Production-ready system

### Phase 4: Enhancement (Week 7+)

- [ ] Advanced analytics dashboards
- [ ] Agent performance tuning
- [ ] Additional tool integrations
- [ ] Multi-tenancy support

---

## Example: Quick Start

### 1. Local Development Setup

```bash
# Clone project
git clone <repo> productivity-assistant
cd productivity-assistant

# Set up Python environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Set up local PostgreSQL + pgvector
docker-compose up -d postgres redis

# Run migrations
python manage.py migrate

# Create superuser
python create_admin.py

# Start development server
python manage.py runserver

# Start MCP server (separate terminal)
uvicorn mcp_server:app --reload --port 8001
```

### 2. Test Coordinator Agent

```bash
curl -X POST http://localhost:8000/api/agent/request \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "Create a call prep task for tomorrow and add notes about key discussion points",
    "user_id": "user-123"
  }'

# Response
{
  "status": "success",
  "workflow_id": "wf-001",
  "coordinator_action": "route to [TaskAgent, NotesAgent]",
  "results": {
    "task": {"id": "task-123", "title": "Call prep", "due_date": "2026-03-31"},
    "note": {"id": "note-456", "title": "Call - Key discussion points"}
  }
}
```

### 3. Deploy to GCP

```bash
# Build and push Docker image
docker build -t gcr.io/my-project/productivity-assistant:latest .
docker push gcr.io/my-project/productivity-assistant:latest

# Deploy to Cloud Run
gcloud run deploy productivity-assistant \
  --image gcr.io/my-project/productivity-assistant:latest \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Conclusion

This multi-agent productivity assistant demonstrates:

1. **Coordination**: Coordinator agent orchestrates multiple specialized sub-agents
2. **Tool Integration**: MCP protocol enables AI models to invoke complex business logic
3. **Data Management**: Structured database design enables persistent state and multi-step workflows
4. **Scalability**: GCP-native deployment on Cloud Run with auto-scaling
5. **Real-World Usability**: Handles complex workflows like meeting scheduling + task prioritization + note-taking

The system can be simplified for MVP or expanded for enterprise-grade deployment depending on needs.
