# Live Updates Architecture for Task Detail Page

## Problem Statement

The Task Detail page currently relies on REST API for data fetching, requiring manual refresh to see:
1. **Conversation list updates** - When new conversations are created (especially during agent runs)
2. **Agent run status changes** - When agent runs start, complete, or fail

**Out of scope for now**: Task documentation live updates (too complex with caching issues - rely on page refresh)

## Proposed Solution: Extend Existing WebSocket with Task-Level Subscriptions

Leverage the existing WebSocket infrastructure with a new subscription layer for task-level events. Only clients subscribed to a specific task will receive updates for that task.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Task Detail Page                            │
│  ┌─────────────────────────────┐  ┌─────────────────────────┐  │
│  │    ConversationList         │  │     AgentSection        │  │
│  │    (live updates ✓)         │  │     (live updates ✓)    │  │
│  └──────────────┬──────────────┘  └────────────┬────────────┘  │
│                 │                              │               │
│                 └──────────────┬───────────────┘               │
│                                │                               │
│                    ┌───────────▼───────────┐                   │
│                    │ useTaskSubscription   │                   │
│                    │ (new hook)            │                   │
│                    └───────────┬───────────┘                   │
└────────────────────────────────┼───────────────────────────────┘
                                 │
                     WebSocket Connection (existing)
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│                        Server                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WebSocket Handler (index.js)               │   │
│  │  - subscribe-task     → Track client task subscriptions │   │
│  │  - unsubscribe-task   → Remove subscription             │   │
│  │  - Existing: subscribe-session, etc.                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                               │
│  ┌─────────────────────────────▼───────────────────────────┐   │
│  │              Task Event Broadcasting                     │   │
│  │  - broadcastToTaskSubscribers(taskId, event)            │   │
│  │  Events:                                                 │   │
│  │    • conversation-added                                  │   │
│  │    • agent-run-updated                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                               │
│  ┌─────────────────────────────▼───────────────────────────┐   │
│  │              Event Sources                               │   │
│  │  - conversationAdapter.js (conversation lifecycle)       │   │
│  │  - agentRunner.js (agent run creation)                   │   │
│  │  - agentRunsDb wrapper (status changes)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Server-Side Task Subscription System

#### 1.1 Add Task Subscription Tracking (`server/index.js`)

```javascript
// New Map to track task subscriptions
const taskSubscriptions = new Map(); // Map<WebSocket, Set<taskId>>

// Add handlers for subscribe-task and unsubscribe-task
if (data.type === 'subscribe-task') {
  const { taskId } = data;
  if (!taskSubscriptions.has(ws)) {
    taskSubscriptions.set(ws, new Set());
  }
  taskSubscriptions.get(ws).add(taskId);
  ws.send(JSON.stringify({ type: 'task-subscribed', taskId }));
}

if (data.type === 'unsubscribe-task') {
  const { taskId } = data;
  taskSubscriptions.get(ws)?.delete(taskId);
  ws.send(JSON.stringify({ type: 'task-unsubscribed', taskId }));
}
```

#### 1.2 Create Broadcasting Utility (`server/utils/taskBroadcast.js`)

```javascript
// Broadcast event only to clients subscribed to a specific task
export function broadcastToTaskSubscribers(wss, taskSubscriptions, taskId, message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const subscribedTasks = taskSubscriptions.get(client);
      if (subscribedTasks?.has(taskId)) {
        client.send(JSON.stringify({ ...message, taskId }));
      }
    }
  });
}
```

### Phase 2: Broadcast Events from Mutation Points

#### 2.1 Conversation Created Events (`server/services/conversationAdapter.js`)

When a new conversation is created, broadcast to task subscribers. This happens in `startConversation()` after the conversation record is created and claude_session_id is captured:

```javascript
// After creating conversation and getting session ID
broadcastToTaskSubscribers(wss, taskSubscriptions, taskId, {
  type: 'conversation-added',
  conversation: {
    id: conversationId,
    task_id: taskId,
    claude_conversation_id: claudeSessionId,
    created_at: new Date().toISOString()
  }
});
```

#### 2.2 Agent Run Status Events

Agent run status changes happen in multiple places. We need to broadcast from:

1. **`server/services/agentRunner.js`** - When agent run is created (status: 'pending' → 'running')
2. **`server/services/conversationAdapter.js`** - When streaming completes (status: 'running' → 'completed' or 'failed')

```javascript
// After updating agent run status
broadcastToTaskSubscribers(wss, taskSubscriptions, taskId, {
  type: 'agent-run-updated',
  agentRun: {
    id: agentRunId,
    status: newStatus,
    agent_type: agentType,
    conversation_id: conversationId
  }
});
```

### Phase 3: Frontend Integration

#### 3.1 Create `useTaskSubscription` Hook (`src/hooks/useTaskSubscription.js`)

```javascript
import { useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useTaskContext } from '../contexts/TaskContext';

export function useTaskSubscription(taskId) {
  const { isConnected, subscribe, unsubscribe, sendMessage } = useWebSocket();
  const { setConversations, setAgentRuns } = useTaskContext();
  const subscribedTaskRef = useRef(null);

  useEffect(() => {
    if (!isConnected || !taskId) return;

    // Subscribe to task events
    sendMessage('subscribe-task', { taskId });
    subscribedTaskRef.current = taskId;

    // Handle new conversation added
    const handleConversationAdded = (msg) => {
      if (msg.taskId === taskId) {
        setConversations(prev => {
          // Avoid duplicates
          if (prev.some(c => c.id === msg.conversation.id)) return prev;
          return [...prev, msg.conversation];
        });
      }
    };

    // Handle agent run status updates
    const handleAgentRunUpdated = (msg) => {
      if (msg.taskId === taskId) {
        setAgentRuns(prev => {
          const existing = prev.find(run => run.id === msg.agentRun.id);
          if (existing) {
            // Update existing
            return prev.map(run =>
              run.id === msg.agentRun.id ? { ...run, ...msg.agentRun } : run
            );
          } else {
            // Add new (for agent run created events)
            return [...prev, msg.agentRun];
          }
        });
      }
    };

    subscribe('conversation-added', handleConversationAdded);
    subscribe('agent-run-updated', handleAgentRunUpdated);

    return () => {
      sendMessage('unsubscribe-task', { taskId });
      subscribedTaskRef.current = null;
      unsubscribe('conversation-added', handleConversationAdded);
      unsubscribe('agent-run-updated', handleAgentRunUpdated);
    };
  }, [taskId, isConnected, sendMessage, subscribe, unsubscribe, setConversations, setAgentRuns]);

  // Re-subscribe on reconnection
  useEffect(() => {
    if (isConnected && subscribedTaskRef.current) {
      sendMessage('subscribe-task', { taskId: subscribedTaskRef.current });
    }
  }, [isConnected, sendMessage]);
}
```

#### 3.2 Integrate in TaskDetailPage (`src/pages/TaskDetailPage.jsx`)

```javascript
function TaskDetailPage() {
  const { projectId, taskId } = useParams();

  // Existing REST API loading...

  // Add WebSocket subscription for live updates
  useTaskSubscription(parseInt(taskId));

  // Rest of component...
}
```

### Phase 4: Enhanced Reliability

#### 4.1 Reconnection Handling

The existing WebSocketContext already handles reconnection with exponential backoff. The `useTaskSubscription` hook handles re-subscription automatically when `isConnected` changes back to `true`.

#### 4.2 Duplicate Prevention

All event handlers check for duplicates before adding to prevent race conditions:

```javascript
// Avoid duplicates when adding conversations
if (prev.some(c => c.id === msg.conversation.id)) return prev;
```

#### 4.3 State Consistency on Reconnection (Optional Enhancement)

If state drift is a concern, refetch data after reconnection:

```javascript
// In useTaskSubscription - optional
const { onDisconnect } = useWebSocket();
const wasDisconnectedRef = useRef(false);

useEffect(() => {
  return onDisconnect(() => {
    wasDisconnectedRef.current = true;
  });
}, [onDisconnect]);

useEffect(() => {
  if (isConnected && wasDisconnectedRef.current) {
    // Refetch to ensure consistency
    loadConversations(taskId);
    loadAgentRuns(taskId);
    wasDisconnectedRef.current = false;
  }
}, [isConnected]);
```

## New WebSocket Message Types

### Client → Server
| Type | Payload | Purpose |
|------|---------|---------|
| `subscribe-task` | `{ taskId }` | Subscribe to task updates |
| `unsubscribe-task` | `{ taskId }` | Unsubscribe from task |

### Server → Client
| Type | Payload | Purpose |
|------|---------|---------|
| `task-subscribed` | `{ taskId, success }` | Confirm subscription |
| `task-unsubscribed` | `{ taskId, success }` | Confirm unsubscription |
| `conversation-added` | `{ taskId, conversation }` | New conversation created for task |
| `agent-run-updated` | `{ taskId, agentRun }` | Agent run status changed |

## Files to Modify

### Backend
| File | Changes |
|------|---------|
| `server/index.js` | Add `taskSubscriptions` Map, handle `subscribe-task`/`unsubscribe-task` messages, export broadcast function |
| `server/services/conversationAdapter.js` | Broadcast `conversation-added` when conversation created, broadcast `agent-run-updated` when status changes |
| `server/services/agentRunner.js` | Broadcast `agent-run-updated` when agent run is created |

### Frontend
| File | Changes |
|------|---------|
| `src/hooks/useTaskSubscription.js` | **New file** - Hook for task-level WebSocket subscriptions |
| `src/pages/TaskDetailPage.jsx` | Add `useTaskSubscription(taskId)` call |
| `src/contexts/TaskContext.jsx` | Expose `setConversations` and `setAgentRuns` in the context value (currently not exposed) |

## Testing Strategy

### Manual Testing with Playwright MCP
1. Navigate to Task Detail page
2. Start an agent run via API call or another browser tab
3. Verify conversation list updates without manual refresh
4. Verify agent status badge updates in real-time
5. Test reconnection: disconnect WiFi, reconnect, verify re-subscription works

### Unit Tests
- Test `broadcastToTaskSubscribers` utility sends to correct clients only
- Test subscription cleanup on WebSocket close

### E2E Tests (Playwright)
```javascript
// Test live conversation updates
test('conversation list updates when agent creates conversation', async ({ page }) => {
  // Navigate to task detail
  await page.goto('/projects/1/tasks/1?token=...');

  // Count current conversations
  const initialCount = await page.locator('[data-testid="conversation-item"]').count();

  // Trigger agent run via API
  await fetch('/api/tasks/1/agent-runs', { method: 'POST', body: { agentType: 'implementation' } });

  // Wait for conversation to appear (WebSocket update)
  await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(initialCount + 1);
});
```

## Summary

This architecture extends the existing WebSocket infrastructure with task-level subscriptions, enabling:
- **Real-time conversation list updates** when agents create new conversations
- **Live agent status updates** as agent runs progress through pending → running → completed/failed
- **Efficient delivery** - only subscribed clients receive events
- **Robust reconnection** - automatic re-subscription after connection loss

All changes follow established patterns in the codebase (pub-sub, session subscriptions, broadcast functions).
