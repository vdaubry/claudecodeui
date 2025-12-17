# WebSocket Reliability Improvement Plan

## Approach: Incremental (PR 1 of 2)

This PR focuses on **critical bug fixes** for stability. Follow-up PR will add message queuing and ACK system.

## Problem Summary

The current WebSocket implementation has multiple issues causing:
1. **Stuck "thinking" mode** - Frontend never receives `claude-complete`
2. **Missing messages** - Stream chunks lost during network instability
3. **Frequent disconnects** - No robust reconnection strategy
4. **Broken resume** - Subscription/filter issues prevent receiving new messages

## Root Cause Analysis

### Issue 1: No Heartbeat Mechanism (FIX IN THIS PR)
- **Current**: No ping/pong between client and server
- **Impact**: Stale connections not detected; server thinks client is connected when it's not
- **Evidence**: `server/index.js` has no heartbeat, `WebSocketContext.jsx` has no ping handling

### Issue 2: Naive Reconnection Strategy (FIX IN THIS PR)
- **Current**: Fixed 3-second delay reconnection (WebSocketContext.jsx:61)
- **Impact**:
  - Server gets hammered during outages
  - No maximum retry limit
  - No jitter to prevent thundering herd

### Issue 3: No Message Acknowledgment (DEFER TO PR 2)
- **Current**: Fire-and-forget message sending (WebSocketContext.jsx:85-95)
- **Impact**: Messages sent just before disconnect are lost forever

### Issue 4: No Message Queueing (DEFER TO PR 2)
- **Current**: `sendMessage()` returns false if not connected, message is lost
- **Impact**: User must re-type and resend messages after reconnect

### Issue 5: Fragile Session Filtering - Resume Bug (FIX IN THIS PR)
- **Current**: `useSessionStreaming.js:92-98` uses `startsWith('new-')` check
- **Impact**: May incorrectly filter messages for actual sessions

### Issue 6: Subscription Race & State Sync (FIX IN THIS PR)
- **Current**: On reconnect, subscription happens but server may have already sent messages
- **Impact**: Messages sent between disconnect and re-subscription are lost

---

## Proposed Architecture (PR 1 Focus)

### High-Level Design

```
Frontend                                    Backend
═════════════════════════════════════════════════════════

WebSocketContext (v2)                    index.js (enhanced)
├── ConnectionManager                    ├── ConnectionMonitor
│   ├── Heartbeat (client pong)          │   ├── Ping/pong
│   ├── Exponential backoff              │   ├── Stale detection
│   └── Max retry handling               │   └── Connection stats
├── MessageQueue                         ├── MessageTracker
│   ├── Pending messages buffer          │   ├── Message IDs
│   └── Auto-retry on reconnect          │   └── ACK responses
├── AckManager                           └── SessionBuffer
│   └── Track message delivery               └── Buffer recent messages
└── StateSync
    └── Reconcile after reconnect
```

---

## Implementation Plan (PR 1 - Critical Fixes) - REVISED

*Changes from external review marked with* ✨

### Step 1: Server-Side Heartbeat

**File: `server/index.js`**

Add ping/pong heartbeat to detect and terminate stale connections:

```javascript
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// After wss creation, add heartbeat interval
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log('[WS] Terminating stale connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// In handleChatConnection:
ws.isAlive = true;
ws.on('pong', () => { ws.isAlive = true; });

// Cleanup on server close
wss.on('close', () => clearInterval(heartbeatInterval));
```

### Step 2: Exponential Backoff + Manual Reconnect

**File: `src/contexts/WebSocketContext.jsx`**

Replace fixed 3-second delay with exponential backoff:

```javascript
// Constants
const BASE_DELAY = 1000;      // 1 second
const MAX_DELAY = 30000;      // 30 seconds
const MAX_ATTEMPTS = 10;

// State
const [connectionState, setConnectionState] = useState('disconnected');
// 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'
const reconnectAttemptRef = useRef(0);

// Calculate delay with jitter
const calculateBackoff = (attempt) => {
  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
  const jitter = delay * 0.1 * (Math.random() - 0.5) * 2;
  return Math.floor(delay + jitter);
};

// On successful connection: reset counter
socket.onopen = () => {
  reconnectAttemptRef.current = 0;
  setConnectionState('connected');
  setIsConnected(true);
};

// On close: exponential backoff
socket.onclose = () => {
  setIsConnected(false);

  if (reconnectAttemptRef.current >= MAX_ATTEMPTS) {
    setConnectionState('failed');
    return; // Stop trying, show manual reconnect
  }

  setConnectionState('reconnecting');
  const delay = calculateBackoff(reconnectAttemptRef.current);
  reconnectAttemptRef.current++;
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
  reconnectTimeoutRef.current = setTimeout(connect, delay);
};

// Add manual reconnect function
const manualReconnect = useCallback(() => {
  reconnectAttemptRef.current = 0;
  setConnectionState('connecting');
  connect();
}, []);
```

Export `connectionState` and `manualReconnect` in context value.

✨ **File: `src/components/MessageInput.jsx`** - Add manual reconnect UI:

```javascript
// Import from context
const { isConnected, connectionState, manualReconnect } = useWebSocket();

// Show reconnect button when connection failed
{connectionState === 'failed' && (
  <button onClick={manualReconnect} className="text-blue-500 underline">
    Reconnect
  </button>
)}
```

### Step 3: Fix Resume Bug - Session Filtering

**File: `src/hooks/useSessionStreaming.js`**

Remove fragile `startsWith('new-')` check:

```javascript
// BEFORE (fragile):
const isNewConversation = currentSessionId && currentSessionId.startsWith('new-');
if (!isNewConversation && currentSessionId && messageSessionId && messageSessionId !== currentSessionId) {
  return; // Ignored
}

// AFTER (robust):
// Accept ALL messages when:
// 1. We don't have a session ID yet (new conversation, waiting for first message)
// 2. The message's session ID matches our session ID
// 3. Message has no session ID (broadcast messages - SDK often omits session_id)
const shouldAccept =
  !currentSessionId ||                              // We don't know our session yet
  !messageSessionId ||                              // Message has no session (broadcasts)
  messageSessionId === currentSessionId;            // Direct match

if (!shouldAccept) {
  console.log('[useSessionStreaming] Ignoring message for different session:', messageSessionId);
  return;
}
```

### ✨ Step 4: Clear Streaming State on Disconnect (NEW - from feedback)

**File: `src/contexts/WebSocketContext.jsx`**

Add disconnect callback to notify subscribers:

```javascript
// Add callback ref for disconnect notification
const onDisconnectCallbacksRef = useRef(new Set());

const onDisconnect = useCallback((callback) => {
  onDisconnectCallbacksRef.current.add(callback);
  return () => onDisconnectCallbacksRef.current.delete(callback);
}, []);

// In socket.onclose and socket.onerror:
socket.onclose = () => {
  setIsConnected(false);
  // Notify all subscribers of disconnect
  onDisconnectCallbacksRef.current.forEach(cb => cb());
  // ... rest of reconnection logic
};

socket.onerror = () => {
  // Also notify on error as connection may be dead
  onDisconnectCallbacksRef.current.forEach(cb => cb());
};
```

**File: `src/hooks/useSessionStreaming.js`**

Subscribe to disconnect to clear streaming state:

```javascript
// Import onDisconnect from WebSocket context
const { onDisconnect } = useWebSocket();

// Clear streaming state immediately on disconnect
useEffect(() => {
  const cleanup = onDisconnect(() => {
    console.log('[useSessionStreaming] Connection lost, clearing streaming state');
    setIsStreaming(false);
    setIsSending(false);
    setClaudeStatus(null);
  });
  return cleanup;
}, [onDisconnect]);
```

### Step 5: State Synchronization on Reconnect (Simplified)

**File: `src/components/ChatInterface.jsx`**

Track previous connection state and sync on reconnect:

```javascript
// Add ref to track previous connection state
const wasConnectedRef = useRef(false);
// ✨ Add debounce flag to prevent double-fetch
const isRefreshingRef = useRef(false);

// Effect to handle reconnection state sync
useEffect(() => {
  const wasConnected = wasConnectedRef.current;
  wasConnectedRef.current = isConnected;

  // Reconnection scenario: was disconnected, now connected
  if (isConnected && !wasConnected && claudeSessionId) {
    console.log('[ChatInterface] Reconnected, syncing state...');

    // 1. Re-subscribe to session
    sendMessage('subscribe-session', {
      sessionId: claudeSessionId,
      provider: 'claude'
    });

    // 2. Check if streaming is still active on server
    sendMessage('check-session-status', { sessionId: claudeSessionId });

    // ✨ 3. Refresh messages with debounce to prevent double-fetch
    if (!isRefreshingRef.current) {
      isRefreshingRef.current = true;
      refreshSessionMessages().finally(() => {
        isRefreshingRef.current = false;
      });
    }
  }
}, [isConnected, claudeSessionId, sendMessage, refreshSessionMessages]);

// Handle session-status response to sync UI
useEffect(() => {
  const handleSessionStatus = (msg) => {
    if (msg.sessionId === claudeSessionId) {
      if (!msg.isProcessing && (isSending || isStreaming)) {
        // Server says not processing but UI shows active - sync it
        console.log('[ChatInterface] Syncing: Server finished, clearing UI state');
        setIsSending(false);
        setIsStreaming(false);
        // ✨ Also refresh to get final messages
        if (!isRefreshingRef.current) {
          isRefreshingRef.current = true;
          refreshSessionMessages().finally(() => {
            isRefreshingRef.current = false;
          });
        }
      }
    }
  };

  subscribe('session-status', handleSessionStatus);
  return () => unsubscribe('session-status', handleSessionStatus);
}, [claudeSessionId, isSending, isStreaming, subscribe, unsubscribe, refreshSessionMessages]);
```

### ~~Step 6: Server-Side Session Buffer~~ ✨ REMOVED

*Removed per feedback: REST API already fetches complete messages from JSONL files.
Adding a server-side buffer that's never consumed is unnecessary complexity.*

---

## Deferred to PR 2

- **Message Queue**: Queue messages when disconnected, flush on reconnect
- **Message ACK System**: Confirm message receipt, retry on timeout

---

## Files to Modify (PR 1) - REVISED

| File | Changes |
|------|---------|
| `server/index.js` | Add heartbeat (ping/pong) only |
| `src/contexts/WebSocketContext.jsx` | Exponential backoff, connectionState, manualReconnect, ✨ onDisconnect callback |
| `src/hooks/useSessionStreaming.js` | Fix fragile session filtering, ✨ clear state on disconnect |
| `src/components/ChatInterface.jsx` | State sync on reconnect, handle session-status, ✨ debounce refresh |
| `src/components/MessageInput.jsx` | ✨ Show manual reconnect button when failed |

---

## Testing Checklist

1. **Heartbeat test**: Connect, wait 60s, check server logs for ping activity
2. **Reconnect test**: Kill server mid-stream, restart, verify reconnection with backoff
3. **Max attempts test**: Kill server, verify UI shows "failed" after 10 attempts
4. **Manual reconnect**: After failure, click reconnect button, verify connection
5. **Resume conversation test**:
   - Start conversation
   - Disconnect network briefly (or kill server)
   - Reconnect
   - Verify new messages arrive after reconnect
6. **Stuck thinking fix**: Simulate disconnect mid-stream, reconnect, verify UI clears thinking state

---

## Expected Outcomes

After this PR:
- Stale connections detected and terminated within 60 seconds
- Reconnection uses exponential backoff (1s → 2s → 4s → ... → 30s)
- Max 10 reconnection attempts before showing manual reconnect
- Resume conversations work reliably after reconnect
- UI state syncs with server state after reconnect (no more "stuck thinking")
