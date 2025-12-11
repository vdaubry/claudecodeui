# Feature: Multi-Session Support (Stateless, Simplified)

## Overview

Goal: simplify session switching by making the client stateless for chat history and eliminating sidebar auto-updates. The client always fetches history from the backend on navigation; the sidebar only changes on user actions (create/select/send).

## Problem Statement

### Current Behavior

1. **New Session Button Blocked**: When a conversation is ongoing, clicking "New Session" does nothing. Users must refresh the page to start a new session.

2. **Session Switching Blocked**: While a session is active with streaming responses, clicking on another session in the sidebar doesn't work. Users must refresh the page to switch.

### Desired Behavior

- Click any session to view it; history loads from backend every time
- Click "New Session" at any time; it appears immediately in sidebar (temp id), empty history
- When viewing a session, see live streaming via WebSocket scoped to that session
- Switching away and back simply refetches full history; streamed content is not cached client-side
- No page refresh required

## Root Cause (current code)

- Session protection and `projects_updated` gating add complexity and still leave `activeSessions` stuck.
- Frontend filters out WS events for other sessions, so completions/aborts for background sessions never clear state.
- localStorage caching per project/same session adds confusion and stale state.

## Solution: Stateless Client with User-Only Sidebar Updates

Principles:
- Frontend never caches chat history; every session click refetches history.
- Sidebar updates only on user actions (create session, send message, select session) plus optional manual refresh. No `projects_updated` handling needed for sidebar.
- One WebSocket scoped to the active session (subscription or per-session socket) to stream new messages; if you navigate away, you drop the stream and will refetch later.
- Sessions are ordered locally by last user message timestamp. No green “active” badges or processing tracking.
- Temp session IDs for new conversations are added immediately; swap to real ID when backend emits `session-created`.

## Implementation Plan (simplified)

1) Drop local caches and filters
- Remove localStorage chat history caching in `src/components/ChatInterface.jsx`.
- Remove message filtering by current session in the WS handler; we won’t rely on in-memory buffering across sessions.

2) Stateless session loading
- On session select: clear chat view, call `loadSessionMessages(project, sessionId)` (existing API), render results.
- On new session: immediately add a temp session to sidebar state (id like `temp-<uuid>`), set active, empty chat; when `session-created` arrives, swap ids.

3) Sidebar owned by user actions
- Keep an in-memory sessions list per project; update it only when the user creates a session, sends a message (bump `lastUserAt`), or selects one.
- Sort sessions by `lastUserAt` desc. No green “active” badges or processing tracking.
- Remove reliance on `projects_updated` for sidebar; optionally add a manual “Refresh sessions” that calls the projects API if external changes are needed.

4) WebSocket scope
- Use one WS connection scoped to the active session. Two options:
  - Single WS + `subscribe-session` message; server filters to that session.
  - Or open one WS per active session; close on switch. (Subscription is lighter.)
- On session switch, re-subscribe (or reconnect) and fetch history; streamed messages while away are not cached—history refetch covers them.
- On reconnect, re-subscribe to the current session id.

5) Backend adjustments (minimal)
- Add `subscribe-session` handling in `handleChatConnection`: track `subscribedSessionId`, filter outgoing chat events by that id; global events optional.
- Ensure all chat stream payloads carry `sessionId` or are sent only when subscribed (may require stamping in `claude-sdk`/Cursor send paths).
- Expose list-sessions API (already present via projects API) for manual refresh.

## Testing Checklist

- Switch sessions repeatedly: each click refetches full history, no cache.
- New session: appears immediately with temp id, swaps to real id on `session-created`, streaming works.
- Sending message: session jumps to top (based on last user message timestamp).
- Reconnect WS: auto re-subscribe and continue streaming current session.
- Optional manual refresh: pulls in externally-created sessions if needed.

## Files Summary

| File | Action | Estimated Changes |
|------|--------|-------------------|
| `src/utils/websocket.js` | Add `subscribeToSession()` function | +15 lines |
| `src/contexts/WebSocketContext.jsx` | Expose new function in context | +2 lines |
| `server/index.js` | Handle subscription, filter messages | +25 lines |
| `src/components/ChatInterface.jsx` | Remove caching, add subscribe call | -50 lines, +10 lines |
| `src/App.jsx` | Remove navigation blocking | -30 lines |

**Net change**: Approximately 50 fewer lines of code

## Testing Checklist

### Manual Testing Scenarios

1. **Basic Session Switching**
   - Start a conversation in session A
   - While Claude is responding, click on session B in sidebar
   - Verify session B loads and displays correctly
   - Click back on session A
   - Verify session A shows full history including messages streamed while viewing B

2. **New Session During Active Conversation**
   - Start a conversation
   - While Claude is responding, click "New Session"
   - Verify new session view appears immediately
   - Type and send a new message
   - Verify new session is created and response streams

3. **Multiple Active Sessions**
   - Start conversation in session A
   - Switch to session B, start a conversation
   - Switch between A and B multiple times
   - Verify each shows correct message history

4. **WebSocket Reconnection**
   - Start a conversation
   - Simulate network disconnect (DevTools > Network > Offline)
   - Reconnect
   - Verify current session resumes correctly

### Browser DevTools Verification

- Check WebSocket messages in Network tab
- Verify `subscribe-session` messages are sent on session switch
- Verify only messages for subscribed session are received

## Rollback Plan

- Re-enable `projects_updated` handling if external updates are required.
- Restore localStorage caching if performance/regressions appear on slow links.
- Remove subscription filtering to return to global WS fan-out.

## Future Considerations

1. **Session indicators**: Show which sessions have unread messages when switching away from active sessions

2. **Background session completion**: Optionally notify users when a background session completes

3. **Message persistence**: If network reliability is a concern, consider periodic polling as a fallback

## References

### Existing Code Entry Points

- WebSocket hook: `src/utils/websocket.js:3` - `useWebSocket()`
- WebSocket context: `src/contexts/WebSocketContext.jsx:19` - `WebSocketProvider`
- Chat WebSocket handler: `server/index.js:706` - `handleChatConnection()`
- Session message loading: `src/components/ChatInterface.jsx:2115` - `loadSessionMessages()`
- Session selection: `src/App.jsx:362` - `handleSessionSelect()`
- Active sessions tracking: `src/App.jsx:70` - `activeSessions` state
- Project update handler: `src/App.jsx:169-245` - WebSocket message effect

### API Endpoints

- Load session messages: `GET /api/sessions/:projectName/:sessionId/messages`
  - Implementation: `server/projects.js`
  - Pagination support: `limit` and `offset` query parameters

## Technical Specifications

- Chat state management (remove caching, drop per-session WS filtering):
  - `src/components/ChatInterface.jsx`:
    - Initial state and localStorage hooks at ~1630-1720 (safeLocalStorage usage for `chat_messages_*`, draft input).
    - Session load effect and `loadSessionMessages` calls at ~2060-2330.
    - WebSocket message handler and session filtering at ~2770-3440.
    - New session handling (`session-created`, temp ID swap) at ~2840-2890.
    - Submit handler for sending messages and marking sessions at ~3740-3890.
- WebSocket plumbing:
  - `src/utils/websocket.js`: connection lifecycle at ~1-120; add `subscribe-session` support and reconnection re-subscribe near `onopen`.
  - `src/contexts/WebSocketContext.jsx`: expose any new subscribe helper (current context init at ~1-50).
- Sidebar and session list ownership:
  - `src/components/Sidebar.jsx`: new session click wrapper and sorting logic at ~90-200; session ordering helper `getAllSessions` at ~140-190.
  - `src/App.jsx`: session selection handlers (`handleSessionSelect`, `handleNewSession`) at ~330-390; remove `projects_updated` gating and `activeSessions` dependency at ~130-250; activeSessions state declaration at ~60-90.
- Backend subscription and stamping:
  - `server/index.js`: `handleChatConnection` at ~700-860; add `subscribe-session` handling and per-connection subscription state.
  - `server/claude-sdk.js`: WS sends for Claude streams at ~360-470 — ensure sessionId is stamped/available if filtering.
  - Cursor path (if needed): sends live in `spawnCursor` flow inside `server/index.js` around the cursor command handling (search for `cursor-command` in `handleChatConnection`).
- Manual refresh hook (optional):
  - `src/App.jsx` or Sidebar: add a user-triggered refresh to call projects API (`api.projects()` already used in `fetchProjects` at ~250-340).

## Technical Onboarding & Phased Refactor Plan

Phase 0 — Familiarize
- Skim `src/components/ChatInterface.jsx` WS handler, session load effect, and submit flow.
- Skim `src/App.jsx` for sidebar state, `activeSessions`, and `projects_updated` handling.
- Skim `src/utils/websocket.js` connection lifecycle; note reconnection behavior.
- Skim `server/index.js` `handleChatConnection` and `server/claude-sdk.js` WS send sites.

Phase 1 — Remove client caching/filtering
- Strip chat history localStorage usage in ChatInterface; keep draft input if desired.
- Remove per-session WS message drop logic; ensure handler can process events without filtering.

Phase 2 — Stateless session loading
- On session select, clear chat view and always call `loadSessionMessages`; no reuse of prior in-memory messages.
- Ensure temp-session swap still works when `session-created` arrives (no cache dependence).

Phase 3 — Sidebar ownership and ordering
- Make sidebar state driven solely by user actions (new session, send message, select session).
- Implement local ordering by last user message timestamp; drop active/processing badges.
- Add optional manual refresh control if external updates are needed.

Phase 4 — WebSocket scoping
- Add `subscribe-session` helper in websocket hook/context; on session change, subscribe (or reconnect).
- On reconnect, re-subscribe to current session.
- Accept that streaming while away is discarded; rely on history refetch on return.

Phase 5 — Backend subscription filter
- Add `subscribe-session` handling in `handleChatConnection`; track `subscribedSessionId`.
- Ensure all chat stream payloads include sessionId or are only sent when subscribed; stamp in Claude/Cursor send paths as needed.
- Keep global events minimal; sidebar no longer depends on `projects_updated`.

Phase 6 — Cleanup and regression passes
- Remove `activeSessions`-based gating in `App.jsx`; delete unused helpers tied to old protection.
- Retest manual scenarios (switching, new session, reconnect, manual refresh).
- Verify temp-to-real session ID swap, and ordering updates on send.
