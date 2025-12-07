# Claude Code UI - Project Documentation

## Overview

Claude Code UI is a web-based interface for Claude Code CLI and Cursor CLI. It provides a desktop/mobile-friendly way to manage coding projects and have conversations with Claude AI.

**Core Concept**: Each *project* is a folder on the machine. Each project contains multiple *sessions* (conversations). Sessions are stored as JSONL files in `~/.claude/projects/{project-name}/`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React (Vite) - Port 5173                                   │
│  ┌─────────┐  ┌──────────────┐  ┌─────────────────┐        │
│  │ Sidebar │  │ ChatInterface│  │  MainContent    │        │
│  │         │  │              │  │                 │        │
│  │Projects │  │  Messages    │  │ Tabs: Chat,     │        │
│  │Sessions │  │  Input       │  │ Files, Shell    │        │
│  └─────────┘  └──────────────┘  └─────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                          │
              WebSocket /ws  │  REST API /api/*
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│  Node.js + Express - Port 3002                              │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────┐         │
│  │  index.js  │  │ claude-sdk.js│  │ projects.js │         │
│  │ WebSocket  │  │ SDK wrapper  │  │ File reader │         │
│  │  routing   │  │              │  │             │         │
│  └────────────┘  └──────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Claude Agent SDK + File System                  │
│  ~/.claude/projects/{project-name}/{session-id}.jsonl       │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### Frontend

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component, state management for projects/sessions, routing |
| `src/components/Sidebar.jsx` | Project list, session list, "New Session" button |
| `src/components/ChatInterface.jsx` | Message display, WebSocket communication, message input |
| `src/components/MainContent.jsx` | Tab container (Chat, Files, Shell, Git) |
| `src/components/MessageInput.jsx` | Text input with @ file references |
| `src/utils/api.js` | REST API client wrapper |

### Backend

| File | Purpose |
|------|---------|
| `server/index.js` | Express server, WebSocket handlers, file watcher |
| `server/claude-sdk.js` | Claude Agent SDK integration, message streaming |
| `server/projects.js` | Reads projects/sessions from `~/.claude/projects/` |
| `server/routes/projects.js` | REST endpoints for projects and sessions |

## Conversation Management

### Data Flow: Loading Existing Sessions

1. **App mounts** → `App.jsx:fetchProjects()` (line 102) calls REST API
2. **Backend** → `server/routes/projects.js` calls `getProjects()` from `server/projects.js`
3. **projects.js** → Reads `~/.claude/projects/` directory, parses JSONL files
4. **Frontend receives** → Array of projects, each with sessions array
5. **User clicks session** → `Sidebar.jsx:handleSessionClick()` triggers `onSessionSelect()`
6. **App.jsx** → Sets `selectedSession`, navigates to `/session/{id}`
7. **ChatInterface.jsx** → `refreshSessionMessages()` (line 347) loads messages via REST API

### Data Flow: Sending a New Message

1. **User types in MessageInput** → State stored in `ChatInterface.jsx:input`
2. **User presses Enter** → `ChatInterface.jsx:handleSubmit()` (line 459)
3. **WebSocket message sent** → Type: `claude-command` with project path, session ID
4. **Backend receives** → `server/index.js` WebSocket handler (line 702)
5. **Calls SDK** → `server/claude-sdk.js:queryClaudeSDK()` (line 348)
6. **SDK streams responses** → Each message sent back via WebSocket as `claude-response`
7. **Frontend displays** → `ChatInterface.jsx:handleClaudeResponse()` (line 316) adds to `streamingMessages`
8. **Stream ends** → Backend sends `claude-complete`, frontend calls `refreshSessionMessages()`

### Data Flow: Creating a New Session

1. **User clicks "New Session"** → `Sidebar.jsx` button triggers `onNewSession(project)`
2. **App.jsx:handleNewSession()** (line 247) → Sets `selectedProject`, clears `selectedSession`
3. **ChatInterface renders** → Shows "No Messages" UI with input field
4. **User sends message** → `handleSubmit()` sends without `sessionId` (line 482)
5. **Backend creates session** → SDK generates new session ID
6. **Backend sends** → `session-created` event with new sessionId (line 386 in claude-sdk.js)
7. **Frontend receives** → `ChatInterface.jsx:handleSessionCreated()` (line 336)
8. **App.jsx** → `onNavigateToSession()` sets session, navigates, refreshes projects
9. **Sidebar updates** → New session appears at top of project's session list

### Session Storage

Sessions are stored as JSONL files by the Claude Agent SDK:
- Location: `~/.claude/projects/{encoded-project-path}/{session-id}.jsonl`
- Each line is a JSON object representing a message or event
- Session metadata (summary, message count) is extracted by `server/projects.js:getSessions()` (line 524)

### Real-Time Updates

The backend uses `chokidar` to watch `~/.claude/projects/` for file changes:
- `server/index.js:setupProjectsWatcher()` (line 85)
- When files change, broadcasts `projects_updated` to all WebSocket clients
- Debounced at 300ms to prevent excessive updates

## State Management

### Frontend State (App.jsx)

| State | Purpose |
|-------|---------|
| `projects` | Array of all projects with their sessions |
| `selectedProject` | Currently selected project object |
| `selectedSession` | Currently selected session object |
| `activeTab` | Current tab: 'chat', 'files', 'shell', 'git' |

### Session Object Shape

```
{
  id: string,              // Unique session ID (UUID)
  summary: string,         // Display name (auto-generated or user-set)
  messageCount: number,    // Total messages in session
  lastActivity: Date,      // Timestamp of last interaction
  __provider: 'claude'     // Added by frontend to distinguish from Cursor
}
```

### Project Object Shape

```
{
  name: string,            // Encoded project name (path with / → -)
  path: string,            // Actual project directory path
  displayName: string,     // User-friendly project name
  sessions: Session[],     // First 5 sessions (pagination)
  sessionMeta: {
    hasMore: boolean,      // More sessions available
    total: number          // Total session count
  }
}
```

## WebSocket Message Types

### Client → Server

| Type | Purpose |
|------|---------|
| `claude-command` | Send user message to Claude |
| `subscribe-session` | Subscribe to updates for specific session |
| `unsubscribe-session` | Unsubscribe from session updates |
| `abort-session` | Stop active session processing |

### Server → Client

| Type | Purpose |
|------|---------|
| `claude-response` | Streaming message from Claude |
| `claude-complete` | Stream finished |
| `claude-error` | Error occurred |
| `session-created` | New session ID generated |
| `projects_updated` | File system changed, projects refreshed |

## REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects` | GET | List all projects with sessions |
| `/api/projects/:name/sessions` | GET | Get sessions for a project |
| `/api/projects/:name/sessions/:id/messages` | GET | Get messages for a session |
| `/api/projects/:name/sessions/:id` | DELETE | Delete a session |

## Quick Reference: Key Methods

### Creating/Managing Sessions

- `App.jsx:handleNewSession()` - Line 247 - Initiates new session mode
- `App.jsx:handleSessionSelect()` - Line 231 - Selects existing session
- `ChatInterface.jsx:handleSessionCreated()` - Line 336 - Handles new session ID
- `server/claude-sdk.js:queryClaudeSDK()` - Line 348 - Creates/resumes sessions

### Loading Messages

- `ChatInterface.jsx:refreshSessionMessages()` - Line 347 - Loads from REST API
- `server/projects.js:getSessionMessages()` - Line 806 - Reads JSONL files

### Sending Messages

- `ChatInterface.jsx:handleSubmit()` - Line 459 - Sends via WebSocket
- `server/index.js` - Line 702 - WebSocket handler
- `server/claude-sdk.js:queryClaudeSDK()` - Line 348 - SDK integration

### Displaying Messages

- `ChatInterface.jsx:handleClaudeResponse()` - Line 316 - Processes streaming
- `ChatInterface.jsx:convertSessionMessages()` - Line 177 - Transforms for display
