# Agent System Documentation

## Overview

The Agent system provides automated workflows for task implementation. Agents run as specialized conversations that help users plan, implement, and review features. The system supports three agent types that form an automated loop: **Planification** (creates plan), **Implementation** (writes code), and **Review** (validates work).

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/constants/agentConfig.js` | Agent message generators with prompts |
| `src/components/AgentSection.jsx` | Agent UI with Run/Resume buttons |
| `src/components/MainContent.jsx` | Agent orchestration, loop control |
| `src/components/ChatInterface.jsx` | Auto-complete detection |
| `src/components/TaskDetailView.jsx` | Task detail UI with workflow toggle |
| `server/database/db.js` | Database operations |
| `server/database/init.sql` | Database schema |
| `scripts/complete-workflow.js` | CLI to mark workflow complete |
| `server/services/notifications.js` | Push notification logic |

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

```
User clicks "Run Implementation"
       ↓
Implementation Agent runs
       ↓
Auto-complete when streaming ends
       ↓
Check workflow_complete from DB
       ↓
workflow_complete? ─YES─→ STOP (notify user)
       │
       NO
       ↓
Chain to Review Agent
       ↓
Review Agent runs tests
       ↓
Auto-complete when streaming ends
       ↓
Check workflow_complete from DB
       ↓
workflow_complete? ─YES─→ STOP (notify user)
       │
       NO
       ↓
Chain back to Implementation (loop continues)
```

## Agent Types

### Planification Agent
- **Purpose:** Creates implementation plan through Q&A
- **Completion:** Manual - user clicks "Complete Plan"
- **Output:** Task documentation at `.claude-ui/tasks/task-{id}.md`

### Implementation Agent
- **Purpose:** Implements next unchecked phase from To-Do List
- **Completion:** Auto-complete when streaming ends
- **Chains to:** Review Agent (unless workflow_complete)

### Review Agent
- **Purpose:** Reviews code, runs tests, validates implementation
- **Completion:** Auto-complete when streaming ends
- **Chains to:** Implementation Agent (unless workflow_complete)

## Workflow Complete Feature

### Purpose
Stops the implementation ↔ review loop when the task is finished, preventing infinite agent scheduling.

### How It Works
1. Agent detects all work is complete (all To-Do items checked, tests pass)
2. Agent runs: `node scripts/complete-workflow.js {taskId}`
3. Sets `workflow_complete = 1` in database
4. Next agent completion checks this flag and stops the loop
5. Push notification sent only when workflow completes

### Manual Override
- Toggle button on Task Detail page: "Mark Done" / "Done"
- Allows user to manually stop or resume the agent loop

### CLI Script
```bash
node scripts/complete-workflow.js <taskId>
```
- Sets workflow_complete = 1 for the specified task
- Used by agents to signal completion

## Push Notifications

| Scenario | Notification |
|----------|--------------|
| User conversation completes | Yes |
| Planification agent completes | Yes |
| Implementation agent completes | Only if workflow_complete |
| Review agent completes | Only if workflow_complete |

## Previous Work Summary

- **Phase 1-7:** Implemented review agent with auto-chain from implementation
- **All unit tests passing (620+)**
- **Current:** Added workflow_complete feature to control agent loop
