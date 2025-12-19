# Agent Loop Refactoring: Server-Side Chaining

## Overview

This document describes a major refactoring to move the agent chaining logic from the frontend to the backend. This enables the implementation ↔ review agent loop to run autonomously even when the browser is closed.

**Status:** Implementation complete

## Problem Statement

### Current Behavior (Frontend-Driven)

The current implementation has agent chaining logic entirely on the frontend:

1. User clicks "Run Implementation"
2. Frontend creates agent run, creates conversation, navigates to chat
3. Frontend detects when streaming ends (`isStreaming` state transition)
4. Frontend calls `handleCompletePlan` which creates the next agent and navigates

**Critical Limitation:** If the user closes the browser or laptop:
- The current agent conversation completes on the server
- But no frontend is listening to trigger the next agent
- The loop stops entirely
- User must manually resume when they return

### Desired Behavior (Backend-Driven)

The loop should continue running autonomously:
- User clicks "Run Implementation" → backend takes over
- Backend handles all chaining logic
- Loop continues until `workflow_complete = true` (set by agent via CLI)
- User can close browser and return later to see progress

## Architecture

### Current Flow
```
Frontend: Click "Run" → Create agent run → Create conversation → Navigate to chat
Frontend: Detect stream end → Call handleCompletePlan → Create next agent → Navigate
```

### New Flow
```
Frontend: Click "Run" → POST /api/tasks/:taskId/agent-runs → Show toast → Stay on page
Backend: Create agent run → Create conversation → Start streaming
Backend: Stream ends → Check workflow_complete → Create next agent → Start streaming
Frontend: Refresh page → Read agent runs via GET API → Display status
```

## Key Decisions

These decisions were made during the planning phase:

### 1. Agent Types and Chaining

| Agent Type | Chaining Behavior |
|------------|-------------------|
| `planification` | **No chaining** - User manually completes Q&A, then manually starts implementation |
| `implementation` | Auto-chains to `review` when complete (unless `workflow_complete = true`) |
| `review` | Auto-chains to `implementation` when complete (unless `workflow_complete = true`) |

**Rationale:** Planification requires interactive Q&A with the user, so it must stay frontend-controlled. Implementation and review are autonomous and can loop without user intervention.

### 2. API Design

**Single endpoint for starting agents:**
```
POST /api/tasks/:taskId/agent-runs
Body: { "agentType": "planification" | "implementation" | "review" }
```

This endpoint:
1. Creates the agent run record
2. Creates the conversation
3. Starts Claude streaming
4. Returns immediately (streaming continues in background)

The chaining logic is triggered on the backend when streaming completes, not when the agent is started.

### 3. Concurrent Run Prevention

Only one agent can run at a time per task. If an agent is already running:
```
409 Conflict
{ "error": "An agent is already running for this task", "runningAgent": {...} }
```

### 4. Error Handling

If an agent run fails (Claude errors out):
- Mark the agent run as `failed`
- Stop the loop (do not chain to next agent)
- User must manually restart

### 5. Loop Control

The loop is controlled by `task.workflow_complete` boolean:
- **Set to `true` by:** Agent via CLI (`node scripts/complete-workflow.js <taskId>`) or user via "Mark Done" toggle
- **Effect:** Stops the implementation ↔ review loop
- **To restart:** User sets `workflow_complete = false`, then clicks "Run Implementation"

### 6. Recovery Mechanism

**Problem:** If the backend crashes or an agent gets stuck in "running" state, the task is blocked.

**Solution:** When user toggles "Mark Done" to `true`:
1. Set `task.workflow_complete = true`
2. Force-complete ALL running agent runs for that task
3. User can then toggle back to `false` and start fresh

### 7. Frontend UX

After clicking "Run Implementation":
- **Stay on Task Detail page** (do not navigate to conversation)
- Show toast: "Implementation agent started"
- User manually refreshes to see progress
- User can click on agent run to view conversation

## API Reference

### POST /api/tasks/:taskId/agent-runs

Start a new agent run.

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

Toggle workflow complete status. Used for recovery from stuck states.

**Request:**
```json
{ "complete": true | false }
```

**Behavior when `complete: true`:**
1. Set `task.workflow_complete = true`
2. Find ALL agent runs for this task with status 'running'
3. Mark each as 'completed' (force-complete)

**Behavior when `complete: false`:**
1. Set `task.workflow_complete = false`
2. No change to agent runs

**Response:**
```json
{ "success": true, "workflow_complete": true }
```

### GET /api/tasks/:taskId/agent-runs

List all agent runs for a task (existing endpoint, no changes needed).

## Files to Modify

### Backend - New Files

| File | Purpose |
|------|---------|
| `server/services/agentRunner.js` | Core agent execution and chaining logic |
| `server/constants/agentPrompts.js` | Agent message generators (moved from frontend) |

### Backend - Modified Files

| File | Changes |
|------|---------|
| `server/routes/agent-runs.js` | Enhance POST to start agent + prevent concurrent runs |
| `server/routes/tasks.js` | Add PUT `/workflow-complete` endpoint |
| `server/routes/conversations.js` | Extract reusable conversation creation logic |

### Frontend - Simplified Files

| File | Changes |
|------|---------|
| `src/components/MainContent.jsx` | Remove `handleCompletePlan`, remove chaining logic (lines 190-284) |
| `src/components/AgentSection.jsx` | Simplify to just call POST API, show toast |
| `src/components/ChatInterface.jsx` | Remove auto-complete effects (lines 348-387) |
| `src/contexts/TaskContext.jsx` | Remove `createAgentRun`, keep `loadAgentRuns` |
| `src/constants/agentConfig.js` | Can be deleted (messages now on backend) |

## Implementation Details

### 1. server/constants/agentPrompts.js

Move these functions from `src/constants/agentConfig.js`:
- `generatePlanificationMessage(taskDocPath)`
- `generateImplementationMessage(taskDocPath, taskId)`
- `generateReviewMessage(taskDocPath, taskId)`

No logic changes needed, just move to backend.

### 2. server/services/agentRunner.js

```javascript
import { tasksDb, agentRunsDb, conversationsDb } from '../database/db.js';
import { createSessionWithFirstMessage } from '../claude-sdk.js';
import {
  generateImplementationMessage,
  generateReviewMessage,
  generatePlanificationMessage
} from '../constants/agentPrompts.js';

/**
 * Start an agent run for a task
 * Creates conversation, starts streaming, handles chaining on completion
 */
export async function startAgentRun(taskId, agentType, options = {}) {
  const { broadcastFn } = options;

  // Get task and project info
  const taskWithProject = tasksDb.getWithProject(taskId);
  const projectPath = taskWithProject.repo_folder_path;
  const taskDocPath = `.claude-ui/tasks/task-${taskId}.md`;

  // Generate message based on agent type
  let message;
  switch (agentType) {
    case 'planification':
      message = generatePlanificationMessage(taskDocPath);
      break;
    case 'implementation':
      message = generateImplementationMessage(taskDocPath, taskId);
      break;
    case 'review':
      message = generateReviewMessage(taskDocPath, taskId);
      break;
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }

  // Create agent run record
  const agentRun = agentRunsDb.create(taskId, agentType, null);

  // Create conversation
  const conversation = conversationsDb.create(taskId);

  // Link conversation to agent run
  agentRunsDb.linkConversation(agentRun.id, conversation.id);

  // Start streaming (returns immediately, streaming continues in background)
  const sessionId = await createSessionWithFirstMessage({
    conversationId: conversation.id,
    taskId,
    message,
    projectPath,
    permissionMode: 'bypassPermissions',
    broadcastToConversation: broadcastFn,
    onSessionCreated: (claudeSessionId) => {
      conversationsDb.updateClaudeId(conversation.id, claudeSessionId);
      // Broadcast streaming-started event
      if (broadcastFn) {
        broadcastFn(conversation.id, {
          type: 'streaming-started',
          taskId,
          conversationId: conversation.id,
          claudeSessionId
        });
      }
    },
    onStreamingComplete: async (claudeSessionId, isError) => {
      // Handle completion and chaining
      await handleAgentComplete(taskId, agentRun.id, agentType, isError, options);
    }
  });

  return { agentRun, conversation, sessionId };
}

/**
 * Handle agent completion - mark complete and chain if needed
 */
async function handleAgentComplete(taskId, agentRunId, agentType, isError, options) {
  // On error: mark failed and stop
  if (isError) {
    agentRunsDb.updateStatus(agentRunId, 'failed');
    console.log(`[AgentRunner] Agent run ${agentRunId} failed, stopping loop`);
    return;
  }

  // Mark current run as completed
  agentRunsDb.updateStatus(agentRunId, 'completed');
  console.log(`[AgentRunner] Agent run ${agentRunId} (${agentType}) completed`);

  // Only chain for implementation/review
  if (agentType !== 'implementation' && agentType !== 'review') {
    console.log(`[AgentRunner] No chaining for ${agentType} agent`);
    return;
  }

  // Check workflow_complete flag (agent may have set this via CLI)
  const task = tasksDb.getById(taskId);
  if (task.workflow_complete) {
    console.log(`[AgentRunner] Task ${taskId} workflow complete, stopping loop`);
    // TODO: Send push notification
    return;
  }

  // Chain to next agent
  const nextType = agentType === 'implementation' ? 'review' : 'implementation';
  console.log(`[AgentRunner] Chaining ${agentType} -> ${nextType} for task ${taskId}`);

  // Small delay before starting next agent (allows DB to settle)
  setTimeout(() => {
    startAgentRun(taskId, nextType, options).catch(err => {
      console.error(`[AgentRunner] Failed to chain to ${nextType}:`, err);
    });
  }, 1000);
}
```

### 3. server/routes/agent-runs.js (Enhanced POST)

```javascript
import { startAgentRun } from '../services/agentRunner.js';

// POST /api/tasks/:taskId/agent-runs
router.post('/tasks/:taskId/agent-runs', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);
    const { agentType } = req.body;

    // Validation
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const validAgentTypes = ['planification', 'implementation', 'review'];
    if (!agentType || !validAgentTypes.includes(agentType)) {
      return res.status(400).json({
        error: `Invalid agent type. Must be one of: ${validAgentTypes.join(', ')}`
      });
    }

    // Verify task ownership
    const taskWithProject = tasksDb.getWithProject(taskId);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check for any running agent on this task (prevent concurrent runs)
    const allRuns = agentRunsDb.getByTask(taskId);
    const runningRun = allRuns.find(r => r.status === 'running');
    if (runningRun) {
      return res.status(409).json({
        error: 'An agent is already running for this task',
        runningAgent: runningRun
      });
    }

    // Helper to broadcast to all WebSocket clients
    const broadcastFn = (convId, msg) => {
      const wss = req.app.locals.wss;
      if (wss) {
        wss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify(msg));
          }
        });
      }
    };

    // Start the agent run
    const { agentRun } = await startAgentRun(taskId, agentType, { broadcastFn });

    res.status(201).json(agentRun);
  } catch (error) {
    console.error('Error starting agent run:', error);
    res.status(500).json({ error: 'Failed to start agent run' });
  }
});
```

### 4. server/routes/tasks.js (New endpoint)

```javascript
// PUT /api/tasks/:taskId/workflow-complete
router.put('/tasks/:taskId/workflow-complete', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);
    const { complete } = req.body;

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    if (typeof complete !== 'boolean') {
      return res.status(400).json({ error: 'complete must be a boolean' });
    }

    // Verify task ownership
    const taskWithProject = tasksDb.getWithProject(taskId);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update task workflow_complete flag
    tasksDb.updateWorkflowComplete(taskId, complete);

    // If marking as complete, force-complete all running agent runs
    if (complete) {
      const agentRuns = agentRunsDb.getByTask(taskId);
      for (const run of agentRuns) {
        if (run.status === 'running') {
          agentRunsDb.updateStatus(run.id, 'completed');
          console.log(`[Recovery] Force-completed stuck agent run ${run.id}`);
        }
      }
    }

    res.json({ success: true, workflow_complete: complete });
  } catch (error) {
    console.error('Error updating workflow complete:', error);
    res.status(500).json({ error: 'Failed to update workflow complete' });
  }
});
```

### 5. Frontend Simplification

**AgentSection.jsx:**
```javascript
const handleRunAgent = async (agentType) => {
  try {
    const response = await api.agentRuns.create(selectedTask.id, agentType);

    if (response.status === 409) {
      // Agent already running
      const data = await response.json();
      showToast(`${data.runningAgent.agent_type} agent is already running`, 'warning');
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to start agent');
    }

    // Show success toast
    showToast(`${agentType} agent started`, 'success');

    // Refresh agent runs list
    await loadAgentRuns(selectedTask.id);
  } catch (error) {
    console.error('Error starting agent:', error);
    showToast('Failed to start agent', 'error');
  }
};
```

**MainContent.jsx - Remove these:**
- `handleCompletePlan` callback (lines ~153-291)
- `handleRunAgent` (moved to AgentSection)
- All references to `onCompletePlan`

**ChatInterface.jsx - Remove these:**
- Auto-complete effect (lines ~348-387)
- `hasAutoCompletedRef` and `prevIsStreamingRef` refs
- Keep streaming display and message input

## Testing Strategy

### Unit Tests

1. **agentRunner.js:**
   - Test `startAgentRun` creates agent run, conversation, links them
   - Test `handleAgentComplete` marks as completed
   - Test chaining logic (implementation → review, review → implementation)
   - Test `workflow_complete` stops the loop
   - Test error handling marks as failed

2. **agent-runs.js routes:**
   - Test concurrent run prevention (409)
   - Test validation

### Integration Tests

1. Start implementation agent → verify review starts automatically after completion
2. Set `workflow_complete = true` via CLI → verify loop stops
3. Start agent while another running → verify 409 error
4. Force-complete via toggle → verify stuck agents are completed

### Manual Testing

1. Run implementation agent, close browser, reopen → verify review ran
2. Run full loop until `workflow_complete` is set by agent
3. Simulate stuck agent → use toggle to recover → restart

## Migration Notes

- Existing agent runs in DB will continue to work
- Frontend can still display agent run status via GET API
- WebSocket events (`streaming-started`, `streaming-ended`) continue to work for Live indicator
- No database schema changes required

## Phase 2 (Future)

Real-time UI updates via WebSocket:
- Frontend subscribes to agent status change events
- UI updates automatically without manual refresh
- Progress indicators for each agent run

This is out of scope for Phase 1.

## Related Files Reference

### Current Frontend Chaining Logic (to be removed)
- `src/components/MainContent.jsx` lines 153-291 - `handleCompletePlan`
- `src/components/ChatInterface.jsx` lines 348-387 - auto-complete effect
- `src/contexts/TaskContext.jsx` - `createAgentRun`, chaining state

### Current Agent Message Generators (to be moved to backend)
- `src/constants/agentConfig.js` - all three `generate*Message` functions

### Backend Files to Extend
- `server/routes/agent-runs.js` - POST endpoint
- `server/routes/tasks.js` - workflow-complete endpoint
- `server/routes/conversations.js` - `createSessionWithFirstMessage` usage pattern

### Database Operations
- `server/database/db.js` - `agentRunsDb`, `tasksDb`, `conversationsDb`
- `server/database/init.sql` - schema reference

## Appendix: Q&A from Planning Session

**Q: When user clicks "Run Implementation", should the backend start just the implementation agent or the full auto-loop?**
A: Start the full auto-loop (implementation → review → implementation... until workflow_complete)

**Q: Should planification agent also move to backend?**
A: No, it stays frontend-controlled because it requires interactive Q&A with the user

**Q: Single endpoint or separate endpoints for creating vs starting agents?**
A: Single endpoint `POST /api/tasks/:taskId/agent-runs` creates AND starts the agent

**Q: How to stop the loop besides `workflow_complete`?**
A: Only via `workflow_complete` - set by agent CLI or user toggle

**Q: What happens on error?**
A: Stop the loop and mark the run as failed

**Q: Should we prevent concurrent runs?**
A: Yes, return 409 if another agent is already running for the same task

**Q: Where should frontend navigate after starting an agent?**
A: Stay on Task Detail page, show toast, user manually refreshes to see progress

**Q: How to handle stuck agents (e.g., after backend crash)?**
A: Toggle "Mark Done" force-completes all running agents, allowing a fresh restart
