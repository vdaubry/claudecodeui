# Refactor: Unified Conversation Adapter Architecture

## Problem

Two separate code paths for handling conversations:
1. `createSessionWithFirstMessage()` - used by agent runs (REST API)
2. `queryClaudeSDK()` - used by WebSocket chat

This fragility causes bugs like agent run status not updating when conversations complete via WebSocket path.

## Solution: Unified Conversation Adapter

Create a single adapter that handles all conversation lifecycle, regardless of how messages are initiated.

```
Frontend (REST or WebSocket)
         │
         ├── Build message + context (caller responsibility)
         │
         v
┌─────────────────────────────────────────┐
│       Conversation Adapter              │
│       (Single unified entry point)      │
│                                         │
│  - sendMessage(conversationId, msg)     │
│  - startConversation(taskId, msg, opts) │
│  - Forwards to Claude SDK               │
│  - Manages entire lifecycle             │
└─────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────┐
│     Lifecycle Event Handler             │
│     (Single place for side effects)     │
│                                         │
│  - onStreamingStarted()                 │
│  - onStreamingComplete()                │
│    → Update agent run status            │
│    → Broadcast WebSocket events         │
│    → Send push notifications            │
└─────────────────────────────────────────┘
```

## Implementation Plan

### Step 1: Create ConversationAdapter service

**File**: `server/services/conversationAdapter.js`

```javascript
// Main entry points:
// - startConversation(taskId, message, options) - for new conversations
// - sendMessage(conversationId, message, options) - for resuming

// Lifecycle hooks (called internally):
// - onStreamingStarted(conversationId, taskId, sessionId)
// - onStreamingComplete(conversationId, taskId, sessionId, isError)

// Options include:
// - broadcastFn - WebSocket broadcast function
// - userId - for notifications
// - customSystemPrompt - for context injection
// - agentRunId - if this is an agent-initiated conversation
```

### Step 2: Implement lifecycle event handling

Inside the adapter, handle all side effects:
- Broadcast `streaming-started` / `streaming-ended` to WebSocket clients
- Update agent run status if conversation is linked to one
- Send push notifications on completion
- Track active sessions

### Step 3: Refactor agentRunner.js

Replace direct `createSessionWithFirstMessage()` call with:
```javascript
const result = await conversationAdapter.startConversation(taskId, message, {
  broadcastFn,
  userId,
  customSystemPrompt: contextPrompt,
  agentRunId: agentRun.id,
  agentType
});
```

### Step 4: Refactor WebSocket handler in index.js

Replace direct `queryClaudeSDK()` call with:
```javascript
// For new conversation:
await conversationAdapter.startConversation(taskId, message, { broadcastFn, userId });

// For resume:
await conversationAdapter.sendMessage(conversationId, message, { broadcastFn, userId });
```

### Step 5: Simplify claude-sdk.js

- Remove lifecycle handling from `createSessionWithFirstMessage()`
- Keep it focused on SDK interaction only
- Or merge into adapter as internal implementation

## Files to Modify

| File | Action |
|------|--------|
| `server/services/conversationAdapter.js` | CREATE - New unified adapter |
| `server/services/agentRunner.js` | MODIFY - Use adapter |
| `server/index.js` | MODIFY - Use adapter for WebSocket |
| `server/claude-sdk.js` | MODIFY - Simplify to SDK wrapper |
| `server/routes/conversations.js` | MODIFY - Use adapter if needed |

## Testing

1. Start new conversation via chat interface
2. Resume existing conversation
3. Start agent run (implementation/review/planification)
4. Verify agent run status updates to 'completed' when streaming ends
5. Verify WebSocket broadcasts work correctly
6. Verify push notifications fire
