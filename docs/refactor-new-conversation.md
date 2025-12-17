# Fix WebSocket Session ID Mismatch: Modal-Based New Conversation Flow

## Problem Summary

When starting a new conversation:
1. REST creates conversation with `claude_conversation_id: null`
2. Frontend immediately navigates to ChatInterface
3. User sends message, backend creates real session ID
4. Frontend filters out messages because session IDs don't match
5. No messages display until user returns and resumes conversation

**Root cause**: Using synthetic IDs or `null` creates race conditions. Frontend renders chat before knowing the real session ID.

## Solution: Modal-First Approach with Synchronous Session Creation

**Key insight**: Instead of waiting for a WebSocket event (fragile), enhance the REST endpoint to synchronously create the session and return the real session ID.

### Flow

1. User clicks "New Chat" → **Modal opens** (not ChatInterface)
2. User enters first message in modal
3. Modal calls **enhanced REST endpoint**: `POST /api/tasks/:taskId/conversations`
   - Request body: `{ message, projectPath, permissionMode }`
   - Backend creates conversation record
   - Backend starts SDK query, waits for session ID (first ~100ms)
   - Backend updates DB with session ID
   - Backend returns conversation with **REAL** `claude_conversation_id`
   - Backend continues streaming via WebSocket in background
4. Modal receives REST response with real session ID
5. Modal navigates to ChatInterface with complete conversation object
6. ChatInterface subscribes to WebSocket with real ID
7. ChatInterface receives remaining streamed messages

### Why REST > WebSocket for this

- **Reliability**: REST is request/response - guaranteed delivery
- **Simplicity**: No race conditions between events and navigation
- **Error handling**: Standard HTTP error codes vs WebSocket event parsing
- **Synchronous**: Modal blocks until it has the real ID

---

## Implementation Plan

### 1. Restore and Adapt NewConversationModal.jsx

**Note**: A similar modal existed previously (`NewSessionModal.jsx`) but was deleted in commit `4efbfeb`. We will restore and adapt it for the task-based architecture.

**Previous implementation** (git show c9c26a9:src/components/NewSessionModal.jsx):
- Used reusable `MessageInput` component (full-featured)
- Waited for `session-created` WebSocket event
- Tracked pending sessions with refs

**Adaptation needed for task-based flow**:

| Old (Session-Based) | New (Task-Based) |
|---------------------|------------------|
| Accepts `project` prop | Accepts `taskId`, `project` props |
| Sends `claude-command` directly | Creates conversation (REST) first, then sends with `conversationId` |
| Waits for `session-created` | Waits for `conversation-created` |
| Returns `sessionId` | Returns `conversation` with `claude_conversation_id` |

**Location**: `src/components/NewConversationModal.jsx`

**Props**:
- `isOpen: boolean` - Modal visibility
- `onClose: () => void` - Close callback
- `onConversationCreated: (conversation) => void` - Success callback
- `taskId: number` - Task to create conversation for
- `project: object` - Project object with `repo_folder_path`

**Key Logic** (SIMPLIFIED - pure REST, no WebSocket waiting):
```javascript
const handleSubmit = useCallback(async (e) => {
  e.preventDefault();
  if (!input.trim() || isSending) return;

  setIsSending(true);
  setError(null);

  try {
    // Single REST call that creates conversation AND starts Claude session
    // Returns conversation with REAL claude_conversation_id
    const response = await api.conversations.createWithMessage(taskId, {
      message: input.trim(),
      projectPath: project.repo_folder_path,
      permissionMode: permissionMode
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create conversation');
    }

    const conversation = await response.json();

    // conversation.claude_conversation_id is GUARANTEED to be set
    // Claude is already streaming in the background
    onConversationCreated(conversation);

  } catch (err) {
    setError(err.message);
    setIsSending(false);
  }
}, [input, isSending, taskId, project, permissionMode, onConversationCreated]);
```

**Add to `api.js`**:
```javascript
conversations: {
  // ... existing methods ...
  createWithMessage: (taskId, { message, projectPath, permissionMode }) =>
    authenticatedFetch(`/api/tasks/${taskId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ message, projectPath, permissionMode }),
    }),
}
```

**Advantages over WebSocket-based approach**:
- Pure REST - no WebSocket subscriptions in modal
- Single request/response - guaranteed delivery
- Standard error handling (try/catch)
- Simpler code, fewer race conditions

**Features preserved from previous implementation**:
- Reusable `MessageInput` component (slash commands, file refs, permission mode)
- `CommandMenu` for slash command autocomplete
- Loading states and error display

### 2. Modify MainContent.jsx

**Location**: `src/components/MainContent.jsx`

**Changes**:
- Add state: `const [showNewConversationModal, setShowNewConversationModal] = useState(false)`
- Change `handleNewConversation` to open modal instead of navigating immediately
- Add `handleConversationCreated` callback that closes modal and calls `selectConversation`
- Render `<NewConversationModal />` in JSX

**Before** (line 98-104):
```javascript
const handleNewConversation = useCallback(async () => {
  if (!selectedTask) return;
  const result = await createConversation(selectedTask.id);
  if (result.success && result.conversation) {
    selectConversation(result.conversation);
  }
}, [...]);
```

**After**:
```javascript
const handleNewConversation = useCallback(() => {
  if (!selectedTask) return;
  setShowNewConversationModal(true);  // Open modal instead
}, [selectedTask]);

const handleConversationCreated = useCallback((conversation) => {
  setShowNewConversationModal(false);
  selectConversation(conversation);  // Navigate with real session ID
}, [selectConversation]);
```

### 3. Modify ChatInterface.jsx

**Location**: `src/components/ChatInterface.jsx`

**Changes**:
- Require real `claudeSessionId` for streaming
- Remove synthetic ID fallback
- Show placeholder if no session ID (shouldn't happen with new flow)

**Before** (line 183-189):
```javascript
const sessionForStreaming = useMemo(() => {
  if (!conversationId) return null;
  return {
    id: claudeSessionId || null,  // Null accepts any messages (dangerous)
    __provider: 'claude'
  };
}, [conversationId, claudeSessionId]);
```

**After**:
```javascript
const sessionForStreaming = useMemo(() => {
  if (!conversationId || !claudeSessionId) return null;  // Require real ID
  return {
    id: claudeSessionId,
    __provider: 'claude'
  };
}, [conversationId, claudeSessionId]);
```

### 4. Modify useSessionStreaming.js

**Location**: `src/hooks/useSessionStreaming.js`

**Changes**: Tighten filtering logic - remove `!currentSessionId` fallback

**Before** (line 96-99):
```javascript
const shouldAccept =
  !currentSessionId ||                    // Accepts all when null (dangerous)
  !messageSessionId ||
  messageSessionId === currentSessionId;
```

**After**:
```javascript
const shouldAccept =
  !messageSessionId ||                    // Broadcast messages only
  messageSessionId === currentSessionId;  // Or exact match
```

### 5. Backend Changes (ENHANCED REST ENDPOINT)

**Location**: `server/routes/conversations.js`

Enhance `POST /api/tasks/:taskId/conversations` to accept first message and return real session ID:

```javascript
router.post('/tasks/:taskId/conversations', async (req, res) => {
  const { message, projectPath, permissionMode } = req.body;  // NEW: optional params

  // ... existing validation ...

  // Create conversation record
  const conversation = conversationsDb.create(taskId);

  // If no message provided, return immediately (backwards compatible)
  if (!message) {
    return res.status(201).json(conversation);
  }

  // NEW: Message provided - create session synchronously
  try {
    // Start SDK query and wait for session ID
    const sessionId = await createSessionWithFirstMessage({
      conversationId: conversation.id,
      taskId,
      message,
      projectPath: projectPath || taskWithProject.repo_folder_path,
      permissionMode: permissionMode || 'bypassPermissions'
    });

    // Update conversation with real session ID
    conversationsDb.updateClaudeId(conversation.id, sessionId);

    // Return complete conversation
    return res.status(201).json({
      ...conversation,
      claude_conversation_id: sessionId
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    return res.status(500).json({ error: 'Session creation failed' });
  }
});
```

**New helper function** in `server/services/sessions.js` or similar:

```javascript
/**
 * Creates a Claude session and waits for session ID
 * Returns as soon as session ID is captured, streaming continues in background
 */
async function createSessionWithFirstMessage({ conversationId, taskId, message, projectPath, permissionMode }) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Session creation timeout')), 30000);

    // Create a minimal WebSocket-like writer that captures session ID
    const sessionIdCapture = {
      sessionId: null,
      onSessionId: null,

      send: (data) => {
        // Forward to actual WebSocket clients subscribed to this conversation
        broadcastToConversation(conversationId, data);
      },

      setSessionId: (id) => {
        this.sessionId = id;
        clearTimeout(timeout);
        resolve(id);  // Resolve the promise with session ID
      }
    };

    // Start the SDK query (non-blocking, continues in background)
    queryClaudeSDK(message, {
      cwd: projectPath,
      permissionMode,
      _dbConversationId: conversationId
    }, sessionIdCapture).catch(reject);
  });
}
```

**Key points**:
- REST endpoint blocks until session ID is captured (~100-200ms)
- SDK continues streaming in background
- Messages are broadcast to subscribed WebSocket clients
- Frontend subscribes after navigation, receives remaining messages

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| REST request timeout (30s) | Backend returns 500 error, modal shows error with retry button |
| Session creation fails | Backend catches error, returns 500, modal displays error |
| User closes modal while REST pending | Request continues but result is ignored |
| Multiple users creating sessions | Each request is independent, no shared state |
| Messages arrive before ChatInterface subscribes | Backend buffers/broadcasts, ChatInterface catches up |
| Resume existing conversation | Unchanged - already has real session ID |
| REST succeeds but WebSocket dead | ChatInterface shows "Connecting..." and will sync on reconnect |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/NewConversationModal.jsx` | **NEW** - Modal component (based on deleted `NewSessionModal.jsx` from commit c9c26a9, simplified for REST) |
| `src/components/MainContent.jsx` | Add modal state, open modal on "New Chat" |
| `src/components/ChatInterface.jsx` | Require real session ID, remove synthetic ID logic |
| `src/hooks/useSessionStreaming.js` | Tighten filtering logic |
| `src/utils/api.js` | Add `createWithMessage` method to `conversations` |
| `server/routes/conversations.js` | **ENHANCE** - Accept `message` param, create session synchronously |
| `server/services/sessions.js` | **NEW** - `createSessionWithFirstMessage` helper function |
| `e2e/hello-world-workflow.spec.js` | Update test for modal flow |

---

## Reference: Previous Modal Implementation

The previous `NewSessionModal.jsx` can be retrieved with:
```bash
git show c9c26a9:src/components/NewSessionModal.jsx
```

**What to reuse from previous implementation**:
- Modal UI structure (overlay, backdrop, close button)
- `MessageInput` component integration with full props
- `CommandMenu` for slash commands
- Loading/error state management

**Key changes for new implementation**:
1. Rename to `NewConversationModal.jsx`
2. Accept `taskId` prop (was just `project`)
3. Use pure REST call instead of WebSocket subscription
4. Single async call replaces WebSocket event waiting
5. Return full conversation object with `claude_conversation_id` guaranteed

---

## Testing

**Manual Testing**:
1. Click "New Chat" - modal should open
2. Enter message, submit - should show loading
3. Wait for Claude - should navigate to chat with messages streaming
4. Verify session ID in console logs matches

**E2E Test Update**:
- Click "New Chat" → modal appears
- Enter message → submit → loading state
- Modal closes → chat displays with streaming messages
