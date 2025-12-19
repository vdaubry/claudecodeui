# Agent System Documentation

## Overview

The Agent system provides automated workflows for task implementation. Agents run as specialized conversations that help users plan, implement, and review features. The system supports three agent types that form an automated loop: **Planification** (creates plan), **Implementation** (writes code), and **Review** (validates work).

The implementation ↔ review loop runs **autonomously on the server**, allowing the loop to continue even when the browser is closed. Only the planification agent requires interactive frontend control for Q&A with the user.

## Architecture

### Key Files

#### Backend (Server-Side Agent Loop)

| File | Purpose |
|------|---------|
| `server/services/agentRunner.js` | Core agent execution and chaining logic |
| `server/constants/agentPrompts.js` | Agent message generators with prompts |
| `server/routes/agent-runs.js` | POST API to start agents, prevents concurrent runs |
| `server/routes/tasks.js` | PUT `/workflow-complete` endpoint for loop control |
| `server/database/db.js` | Database operations |
| `server/database/init.sql` | Database schema |
| `scripts/complete-workflow.js` | CLI to mark workflow complete |
| `server/services/notifications.js` | Push notification logic |

#### Frontend (UI Only)

| File | Purpose |
|------|---------|
| `src/components/AgentSection.jsx` | Agent UI with Run/Resume buttons (calls API) |
| `src/components/TaskDetailView.jsx` | Task detail UI with workflow toggle |
| `src/components/MainContent.jsx` | Handles agent run creation via `handleRunAgent()` |
| `src/components/ChatInterface.jsx` | Conversation display and streaming |
| `src/contexts/TaskContext.jsx` | Agent runs state management and API methods |
| `src/contexts/ToastContext.jsx` | Toast notifications for agent status |

### Database Schema

**tasks table:**
```sql
- id, project_id, title
- status: 'pending' | 'in_progress' | 'completed'
- workflow_complete: INTEGER (0/1) - stops agent loop when true
- created_at, updated_at
```

**task_agent_runs table:**
```sql
- id, task_id
- agent_type: 'planification' | 'implementation' | 'review'
- status: 'pending' | 'running' | 'completed' | 'failed'
- conversation_id, created_at, completed_at
```

## Agent Loop Flow

### Server-Side Chaining (Implementation ↔ Review)

```
Frontend: User clicks "Run Implementation"
       ↓
Frontend: POST /api/tasks/:taskId/agent-runs { agentType: "implementation" }
       ↓
Frontend: Shows toast "Implementation agent started", stays on page
       ↓
Backend: Creates agent run → Creates conversation → Starts Claude streaming
       ↓
Backend: Streaming completes
       ↓
Backend: Check workflow_complete from DB
       ↓
workflow_complete? ─YES─→ STOP (send push notification)
       │
       NO
       ↓
Backend: Chain to Review Agent (auto-start)
       ↓
Backend: Review Agent runs tests
       ↓
Backend: Streaming completes
       ↓
Backend: Check workflow_complete from DB
       ↓
workflow_complete? ─YES─→ STOP (send push notification)
       │
       NO
       ↓
Backend: Chain back to Implementation (loop continues autonomously)
```

**Key Difference from Frontend-Driven Architecture:**
- The loop continues even if the user closes the browser
- No frontend listener required to trigger the next agent
- User can check progress by refreshing the Task Detail page

## Agent Types

### Planification Agent
- **Purpose:** Creates implementation plan through interactive Q&A
- **Control:** Frontend-controlled (requires user interaction)
- **Completion:** Manual - user clicks "Complete Plan"
- **Output:** Task documentation at `.claude-ui/tasks/task-{id}.md`
- **Chaining:** None - user manually starts implementation when ready

### Implementation Agent
- **Purpose:** Implements next unchecked phase from To-Do List
- **Control:** Server-side (runs autonomously)
- **Completion:** Auto-complete when streaming ends
- **Chaining:** Auto-chains to Review Agent (unless `workflow_complete = true`)

### Review Agent
- **Purpose:** Reviews code, runs tests, validates implementation
- **Control:** Server-side (runs autonomously)
- **Completion:** Auto-complete when streaming ends
- **Chaining:** Auto-chains to Implementation Agent (unless `workflow_complete = true`)

### Chaining Summary

| Agent Type | Chaining Behavior |
|------------|-------------------|
| `planification` | **No chaining** - User manually completes Q&A, then manually starts implementation |
| `implementation` | Auto-chains to `review` when complete (unless `workflow_complete = true`) |
| `review` | Auto-chains to `implementation` when complete (unless `workflow_complete = true`) |

### Context Injection

All agents receive contextual information via a custom system prompt built by `buildContextPrompt()`:

1. **Project documentation** (`project.md` at project root) - Project-wide context
2. **Task documentation** (`.claude-ui/tasks/task-{id}.md`) - Task-specific implementation plan

This ensures agents have full context about the project and current task without needing to read files themselves.

## Workflow Complete Feature

### Purpose
Stops the implementation ↔ review loop when the task is finished, preventing infinite agent scheduling.

### How It Works
1. Agent detects all work is complete (all To-Do items checked, tests pass)
2. Agent runs: `node scripts/complete-workflow.js {taskId}`
3. Sets `workflow_complete = 1` in database
4. Backend checks this flag after each agent completes and stops the loop
5. Push notification sent when workflow completes

### Manual Override
- Toggle button on Task Detail page: "Mark Done" / "Done"
- Allows user to manually stop or resume the agent loop

### CLI Script
```bash
node /home/ubuntu/claudecodeui/scripts/complete-workflow.js <taskId>
```
- Sets workflow_complete = 1 for the specified task
- Used by agents to signal completion
- **Note:** Uses absolute path because agents run in user project directories, not the claudecodeui directory

### Recovery Mechanism

If an agent gets stuck in "running" state (e.g., after a server crash):

1. User toggles "Mark Done" to `true` on Task Detail page
2. This calls `PUT /api/tasks/:taskId/workflow-complete { complete: true }`
3. Backend sets `workflow_complete = true` AND force-completes all running agent runs
4. User can then toggle back to `false` and start fresh

### Error Handling

If an agent run fails (Claude errors out):
- Agent run is marked as `failed`
- Loop stops (does not chain to next agent)
- User must manually restart

### Concurrent Run Prevention

Only one agent can run at a time per task:
- Starting a new agent while one is running returns `409 Conflict`
- Response includes the currently running agent info

## API Reference

### POST /api/tasks/:taskId/agent-runs

Start a new agent run. The agent executes on the backend and chains automatically.

**Request:**
```json
{ "agentType": "planification" | "implementation" | "review" }
```

**Success Response (201):**
```json
{
  "id": 123,
  "task_id": 1,
  "agent_type": "implementation",
  "status": "running",
  "conversation_id": 456,
  "created_at": "2024-01-15T10:30:00Z",
  "completed_at": null
}
```

**Error Responses:**
- `400` - Invalid agent type
- `404` - Task not found
- `409` - Another agent is already running for this task

### PUT /api/tasks/:taskId/workflow-complete

Toggle workflow complete status. Used for stopping the loop or recovery from stuck states.

**Request:**
```json
{ "complete": true | false }
```

**Behavior when `complete: true`:**
1. Set `task.workflow_complete = true`
2. Find ALL agent runs for this task with status 'running'
3. Mark each as 'completed' (force-complete for recovery)

**Behavior when `complete: false`:**
1. Set `task.workflow_complete = false`
2. No change to agent runs

**Response:**
```json
{
  "success": true,
  "workflow_complete": true,
  "forceCompletedAgents": 0
}
```

Note: `forceCompletedAgents` indicates how many stuck agent runs were force-completed during recovery.

### GET /api/tasks/:taskId/agent-runs

List all agent runs for a task (for displaying status in UI).

**Response (200):**
```json
[
  {
    "id": 123,
    "task_id": 1,
    "agent_type": "implementation",
    "status": "completed",
    "conversation_id": 456,
    "created_at": "2024-01-15T10:30:00Z",
    "completed_at": "2024-01-15T10:35:00Z"
  }
]
```

### GET /api/agent-runs/:id

Get a specific agent run by ID.

**Response (200):**
```json
{
  "id": 123,
  "task_id": 1,
  "agent_type": "implementation",
  "status": "completed",
  "conversation_id": 456,
  "created_at": "2024-01-15T10:30:00Z",
  "completed_at": "2024-01-15T10:35:00Z"
}
```

### PUT /api/agent-runs/:id/complete

Mark an agent run as completed manually.

**Response (200):**
Returns the updated agent run object.

### PUT /api/agent-runs/:id/link-conversation

Link a conversation to an agent run.

**Request:**
```json
{ "conversationId": 456 }
```

**Response (200):**
Returns the updated agent run object.

### DELETE /api/agent-runs/:id

Delete an agent run.

**Response (200):**
```json
{ "success": true }
```

## Push Notifications

### Banner Notifications (Visible Alerts)

| Scenario | Notification |
|----------|--------------|
| User conversation completes | Yes |
| Planification agent completes | Yes |
| Implementation agent completes | Only if workflow_complete |
| Review agent completes | Only if workflow_complete |

### Badge Updates (Silent)

Badge count reflects the number of `in_progress` tasks for the user:

| Scenario | Badge Update |
|----------|--------------|
| Task status changes to/from `in_progress` | Yes |
| Agent starts and task moves to `in_progress` | Yes |
| Manual status change via UI | Yes |

## Implementation History

- **Phase 1-7:** Implemented planification, implementation, and review agents with frontend-driven chaining
- **Phase 8:** Added `workflow_complete` feature to control agent loop
- **Phase 9:** Refactored to server-side chaining architecture
  - Moved agent chaining logic from frontend to `server/services/agentRunner.js`
  - Moved agent prompts from `src/constants/agentConfig.js` to `server/constants/agentPrompts.js`
  - Added concurrent run prevention (409 Conflict)
  - Added recovery mechanism for stuck agents
  - Frontend simplified to API calls only
- **All unit tests passing (620+)**
