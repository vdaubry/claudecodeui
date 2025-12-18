# Claude Code UI - Project Documentation

## Overview

Claude Code UI is a web-based interface for Claude Code CLI. It provides a desktop/mobile-friendly way to manage coding projects and have conversations with Claude AI.

**Core Concept**: The app uses a **task-driven development** model:
- **Project**: An explicit database entry pointing to a Git repository
- **Task**: A unit of work with markdown documentation (stored in `.claude-ui/tasks/`)
- **Conversation**: A Claude session linked to a specific task

Users create projects, define tasks as units of work, and start conversations scoped to specific tasks. Task documentation is automatically injected as context when starting a conversation.

## Architecture

The frontend uses a **Trello-style Board UX** with a 4-screen navigation flow:

```
+-------------------------------------------------------------+
|                        Frontend                              |
|  React (Vite) - Port 5173                                   |
|  +---------------+  +---------------+  +-----------------+  |
|  | Dashboard     |  | BoardView     |  | TaskDetailView  |  |
|  | Project Grid  |  | Kanban Cols   |  | Task docs       |  |
|  | + In Progress |  | Task Cards    |  | Conversations   |  |
|  +---------------+  +---------------+  +-----------------+  |
|         |                  |                  |              |
|         +------------------+------------------+              |
|                            |                                |
|                   +----------------+                        |
|                   | ChatInterface  |                        |
|                   | Messages/Input |                        |
|                   +----------------+                        |
+-------------------------------------------------------------+
                          |
              WebSocket /ws  |  REST API /api/*
                          v
+-------------------------------------------------------------+
|                        Backend                               |
|  Node.js + Express - Port 3002                              |
|  +--------------+  +----------------+  +------------------+ |
|  | index.js     |  | claude-sdk.js  |  | documentation.js | |
|  | WebSocket    |  | SDK wrapper    |  | .claude-ui/ I/O  | |
|  | routing      |  | context inject |  |                  | |
|  +--------------+  +----------------+  +------------------+ |
+-------------------------------------------------------------+
                          |
                          v
+-------------------------------------------------------------+
|              Claude Agent SDK + File System                  |
|  ~/.claude/projects/{project-name}/{conversation-id}.jsonl  |
|  {repo}/.claude-ui/project.md                               |
|  {repo}/.claude-ui/tasks/task-{id}.md                       |
+-------------------------------------------------------------+
```

## Key Files

### Frontend

#### Core Navigation & State

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component, providers, project form modal |
| `src/contexts/TaskContext.jsx` | State management for projects, tasks, conversations, navigation |
| `src/components/MainContent.jsx` | View routing: Dashboard → Board → TaskDetail → Chat |
| `src/components/Breadcrumb.jsx` | Navigation breadcrumb (Home > Project > Task) |
| `src/utils/api.js` | REST API client for projects/tasks/conversations |

#### Dashboard (Project Grid)

| File | Purpose |
|------|---------|
| `src/components/Dashboard/Dashboard.jsx` | Full-screen dashboard with CSS Grid of project cards |
| `src/components/Dashboard/ProjectCardGrid.jsx` | Grid-style project card with status badges, doc preview |
| `src/components/Dashboard/StatusBadge.jsx` | Clickable status count badge (pending/in_progress/completed) |
| `src/components/Dashboard/ViewToggle.jsx` | "By Project" / "In Progress" toggle buttons |
| `src/components/Dashboard/InProgressSection.jsx` | Cross-project view of all in-progress tasks |
| `src/components/Dashboard/TaskRow.jsx` | Task row with status badge (used in InProgressSection) |

#### Board View (Kanban)

| File | Purpose |
|------|---------|
| `src/components/Dashboard/BoardView.jsx` | Kanban board container with 3 columns (mobile scroll-snap) |
| `src/components/Dashboard/BoardColumn.jsx` | Single column: Pending, In Progress, or Completed |
| `src/components/Dashboard/BoardTaskCard.jsx` | Task card in column with LIVE indicator, doc preview |
| `src/components/Dashboard/EmptyColumnIllustration.jsx` | Decorative SVG for empty columns |

#### Task Detail & Chat

| File | Purpose |
|------|---------|
| `src/components/TaskDetailView.jsx` | Task docs (editable), conversation list |
| `src/components/ChatInterface.jsx` | Message display, WebSocket, message input |
| `src/components/ConversationList.jsx` | Conversation cards with Open/Resume buttons |
| `src/components/MarkdownEditor.jsx` | View/edit toggle for documentation |

#### Edit Pages

| File | Purpose |
|------|---------|
| `src/components/ProjectEditPage.jsx` | Full-page project edit form |
| `src/components/TaskEditPage.jsx` | Full-page task edit form with status dropdown |

### Backend

| File | Purpose |
|------|---------|
| `server/index.js` | Express server, WebSocket handlers, route registration |
| `server/claude-sdk.js` | Claude Agent SDK integration, custom system prompt support |
| `server/services/documentation.js` | Read/write `.claude-ui/` files, build context prompts |
| `server/services/sessions.js` | JSONL message reading for conversation history |
| `server/database/db.js` | Database operations: `projectsDb`, `tasksDb`, `conversationsDb` |
| `server/routes/projects.js` | Project CRUD + documentation endpoints |
| `server/routes/tasks.js` | Task CRUD + documentation endpoints |
| `server/routes/conversations.js` | Conversation CRUD + messages endpoints |

## Database Schema

Three tables manage the task-driven workflow:

**`projects`** - User-created projects pointing to repo folders
- `id`, `user_id`, `name`, `repo_folder_path`, `created_at`, `updated_at`

**`tasks`** - Work items belonging to projects
- `id`, `project_id` (FK), `title`, `created_at`, `updated_at`
- Documentation at `.claude-ui/tasks/task-{id}.md` (convention, not stored)

**`conversations`** - Links Claude sessions to tasks
- `id`, `task_id` (FK), `claude_conversation_id`, `created_at`

## Conversation Management

### Data Flow: Starting a New Conversation

1. **User clicks "New Conversation"** on TaskDetailView
2. **Frontend sends WebSocket** → `claude-command` with `taskId`, `isNewConversation: true`
3. **Backend looks up** → Task → Project → `repo_folder_path`
4. **Backend creates** → Conversation record in DB
5. **Backend reads** → `{repo}/.claude-ui/project.md` + `task-{id}.md`
6. **Backend builds** → Combined system prompt with project/task context
7. **Calls Claude SDK** → With `customSystemPrompt` option
8. **SDK streams responses** → Each sent via WebSocket as `claude-response`
9. **On first message** → Backend captures `session_id`, updates conversation record
10. **Stream ends** → Backend sends `claude-complete`

### Data Flow: Resuming a Conversation

1. **User clicks "Resume"** on existing conversation
2. **Frontend sends WebSocket** → `claude-command` with `conversationId`, `isNewConversation: false`
3. **Backend looks up** → Conversation → `claude_conversation_id`
4. **Calls Claude SDK** → With `resume: claude_conversation_id`
5. **Streaming proceeds** normally (no context injection needed)

### File Structure Convention

```
<repo-root>/
  .claude-ui/                    # Auto-created when project added
    project.md                   # Project-level documentation
    tasks/                       # Auto-created when project added
      task-1.md                  # Task documentation (auto-created blank)
      task-2.md
```

## State Management

### TaskContext State

The `TaskContext` manages all navigation and data state:

| State | Purpose |
|-------|---------|
| `selectedProject` | Currently selected project object |
| `selectedTask` | Currently selected task object |
| `activeConversation` | Currently active conversation object |
| `editingProject` | Project being edited (for edit page) |
| `editingTask` | Task being edited (for edit page) |
| `currentView` | View state: `'empty'`, `'board'`, `'task-detail'`, `'chat'`, `'project-edit'`, `'task-edit'` |
| `dashboardViewMode` | Dashboard toggle: `'project'` or `'status'` |
| `projects` | Array of all user projects |
| `tasks` | Array of tasks for selected project |
| `conversations` | Array of conversations for selected task |
| `projectDoc` | Current project documentation content |
| `taskDoc` | Current task documentation content |
| `isLoading*` | Loading states for each resource |

### Navigation Actions

| Action | Purpose |
|--------|---------|
| `selectProject(project)` | Navigate to board view (loads tasks) |
| `selectTask(task)` | Navigate to task detail view |
| `selectConversation(conversation)` | Navigate to chat view |
| `navigateToBoard(project)` | Open board view for project |
| `navigateToProjectEdit(project)` | Open project edit page |
| `navigateToTaskEdit(task)` | Open task edit page |
| `exitEditMode()` | Return from edit pages |
| `navigateBack()` | Go back one level in navigation |
| `clearSelection()` | Return to dashboard |
| `setDashboardViewMode(mode)` | Toggle between 'project' and 'status' views |

### Object Shapes

```javascript
// Project
{
  id: number,
  name: string,              // Display name
  repo_folder_path: string,  // Absolute path to repo
  created_at: string,
  updated_at: string
}

// Task
{
  id: number,
  project_id: number,
  title: string,             // Display title
  created_at: string,
  updated_at: string
}

// Conversation
{
  id: number,
  task_id: number,
  claude_conversation_id: string,  // Session ID from Claude SDK
  created_at: string
}
```

## WebSocket Message Types

### Client → Server

| Type | Purpose |
|------|---------|
| `claude-command` | Send message to Claude (with taskId/conversationId) |
| `subscribe-session` | Subscribe to updates for specific conversation |
| `unsubscribe-session` | Unsubscribe from conversation updates |
| `abort-session` | Stop active conversation processing |

### Server → Client

| Type | Purpose |
|------|---------|
| `claude-response` | Streaming message from Claude |
| `claude-complete` | Stream finished |
| `claude-error` | Error occurred |
| `session-created` | New conversation ID generated |

## REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/:id` | GET, PUT, DELETE | Get/update/delete project |
| `/api/projects/:id/documentation` | GET, PUT | Get/save project.md |
| `/api/projects/:projectId/tasks` | GET, POST | List/create tasks |
| `/api/tasks/:id` | GET, PUT, DELETE | Get/update/delete task |
| `/api/tasks/:id/documentation` | GET, PUT | Get/save task-{id}.md |
| `/api/tasks/:taskId/conversations` | GET, POST | List/create conversations |
| `/api/conversations/:id` | GET, DELETE | Get/delete conversation |
| `/api/conversations/:id/messages` | GET | Get conversation messages |

## UI Navigation Flow

The app uses a **4-screen navigation** model with a Trello-style board view:

```
Dashboard ─────► Board View ─────► Task Detail ─────► Chat
(project grid)   (kanban cols)    (docs + convos)   (messages)
    ◄────────────────◄────────────────◄────────────────◄
```

### Screen 1: Dashboard (Project Grid)

**By Project View (Default)**
- Projects displayed as **cards in a CSS Grid** (1 col mobile, 2-3 cols desktop)
- Each card shows: name, path, status badges with counts, doc preview
- Click card → opens Board View
- Edit/Delete buttons on each card
- LIVE indicator on cards with active streaming tasks

**In Progress View**
- Cross-project view of all in-progress tasks
- Shows "Project > Task" for each row

### Screen 2: Board View (Kanban)

- Breadcrumb: Home > Project Name
- Header with "New Task" button
- **3 columns**: Pending, In Progress, Completed
- Tasks displayed as cards within columns
- **Desktop**: All 3 columns visible, page scrolls vertically
- **Mobile**: CSS scroll-snap, one column at a time (partial edge visible as hint)
- Empty columns show decorative SVG illustrations
- Click task card → Task Detail View
- Edit button on task card → Task Edit Page

### Screen 3: Task Detail

- Back button returns to Board View
- Task documentation preview with Edit button
- List of conversations with status (LIVE/Paused)
- "+ New Conversation" button

### Screen 4: Chat Interface

- Back button returns to Task Detail
- Breadcrumb navigation: Home > Project > Task
- Full chat interface with message input

### Visual Indicators

| Status | Indicator |
|--------|-----------|
| LIVE | Pulsing red dot - Claude session is streaming |
| In Progress | Amber badge - Has conversation history, not active |
| Pending | Slate badge - No conversation started |
| Completed | Emerald badge - Task marked done |

## Quick Reference: Key Methods

### Navigation

- `TaskContext.jsx:selectProject()` - Open board view and load tasks
- `TaskContext.jsx:selectTask()` - Navigate to task detail view
- `TaskContext.jsx:selectConversation()` - Navigate to chat view
- `TaskContext.jsx:navigateToProjectEdit()` - Open project edit page
- `TaskContext.jsx:navigateToTaskEdit()` - Open task edit page
- `TaskContext.jsx:exitEditMode()` - Return from edit pages
- `TaskContext.jsx:navigateBack()` - Go back one level
- `TaskContext.jsx:clearSelection()` - Return to dashboard

### Project/Task/Conversation Management

- `TaskContext.jsx` - All CRUD actions for projects, tasks, conversations
- `api.js:projects.*` - REST client for project endpoints
- `api.js:tasks.*` - REST client for task endpoints
- `api.js:conversations.*` - REST client for conversation endpoints

### Context Injection

- `server/services/documentation.js:buildContextPrompt()` - Combines project + task docs
- `server/claude-sdk.js:mapCliOptionsToSDK()` - Handles `customSystemPrompt` option

### Message Handling

- `ChatInterface.jsx:handleSubmit()` - Sends via WebSocket with taskId/conversationId
- `server/index.js` - WebSocket handler for `claude-command`
- `server/claude-sdk.js:queryClaudeSDK()` - SDK integration with context injection
- `server/services/sessions.js:getSessionMessages()` - Reads JSONL files

### Dashboard & Board Components

- `Dashboard.jsx` - Main container with CSS Grid of project cards
- `ProjectCardGrid.jsx` - Grid-style project card with status badges
- `BoardView.jsx` - Kanban board with 3 columns (mobile scroll-snap)
- `BoardColumn.jsx` - Single column (Pending/In Progress/Completed)
- `BoardTaskCard.jsx` - Task card within board column
- `ViewToggle.jsx` - "By Project" / "In Progress" toggle
