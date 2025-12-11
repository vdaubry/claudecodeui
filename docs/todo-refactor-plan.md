# Task-Driven Development Environment Refactor

## Goal

Transform the Claude Code UI from a **folder/conversation-based** interface into a **task-driven development environment**.

**Current Architecture:**
```
Folder (auto-discovered from ~/.claude/projects/)
  └── Conversations (sessions stored as JSONL files)
```

**New Architecture:**
```
Project (explicit DB entry with repo path)
  └── Task (work item with markdown documentation)
       └── Conversation (Claude session linked to task)
```

The key shift: Instead of browsing existing Claude CLI sessions by folder, users will **create projects**, define **tasks** as units of work, and start **conversations** scoped to specific tasks. Task documentation is automatically injected as context when starting a conversation.

---

## Guiding Principles

These principles guide all implementation decisions:

1. **Database is an index layer** - The DB stores relationships and IDs, not content. It maps our entities to Claude Code's native conversation files.

2. **Markdown is the authoritative source** - All documentation lives in markdown files within the Git repo. No duplication between DB and filesystem.

3. **Git-friendly by design** - Documentation stored in `.claude-ui/` folder is version-controlled, enabling collaboration and history.

4. **Claude-native architecture** - Uses Claude Code's folder-based conversation model. The SDK always receives the project's `repo_folder_path`.

5. **Multiple async conversations supported** - WebSocket streams remain active regardless of UI navigation. Users can switch between conversations fluidly. This was a key reason for choosing this codebase as a base.

6. **Tasks as the center of workflow** - Tasks are the primary "unit of work". Every conversation belongs to a task.

---

## Scope

### In Scope (V0)
- CRUD for projects and tasks
- Database models for Projects, Tasks, Conversations
- Markdown file storage for project + task documentation
- Chat UI with multiple streaming conversations
- Context injection at conversation start
- Clean sidebar → task detail → chat UI flow
- Unit tests for all new features

### Out of Scope (V0)
- Collaboration features (multi-user on same project)
- Sync/import of CLI-created conversations
- Custom task metadata (priority, status, tags) beyond title
- Advanced project management flows (kanban, sprints)
- Subtasks

### Future Considerations
These are explicitly deferred but worth noting for future versions:
- Should tasks support subtasks?
- Should tasks have metadata (priority, status, tags)?
- Auto-sync CLI-created conversations into tasks?
- Embedding MD editor vs separate panel?
- Chat-generated code updates automation?

---

## Design Decisions (Q&A)

These decisions were made during the design phase. **Do not revisit these questions** - they are settled.

### 1. Should we migrate existing projects automatically?

**Question:** The current system discovers projects from `~/.claude/projects/`. Should Phase 1 create database Project records for these automatically, or start fresh with only manually-added projects?

**Answer:** **Start fresh.** No migration. Only new manually-added projects will exist in the database. The legacy `~/.claude/projects/` discovery remains functional but separate from the new task-driven system.

---

### 2. What happens to existing conversations?

**Question:** Current sessions are linked to Claude CLI's folder structure, not tasks. What happens to existing conversations?

**Answer:** **Ignore them.** Existing conversations from the old system are not migrated or shown in the new UI. They remain accessible via Claude CLI directly if needed, but the new UI only shows conversations linked to tasks.

---

### 3. When is the `.claude-ui/` folder created?

**Question:** When a project is added, should the app auto-create the `.claude-ui/` folder structure, or require it to exist already?

**Answer:** **Auto-create.** When a project is added via the UI, the app automatically creates:
- `{repo}/.claude-ui/`
- `{repo}/.claude-ui/tasks/`

The `project.md` file is NOT auto-created (starts empty, user creates content via UI).

---

### 4. How does task creation work?

**Question:** When creating a task, what's the UX? Auto-generate filename? Provide template? Required metadata?

**Answer:**
- **Filename:** Auto-generated as `task-{id}.md` where `{id}` is the database auto-increment ID. This is a strong convention - users cannot customize the filename.
- **Template:** No template. The markdown file is created blank/empty.
- **Metadata:** Freeform markdown. No required structure. The `title` field in the database is separate from the markdown content.

---

### 5. How do we discover tasks?

**Question:** Should we scan `.claude-ui/tasks/` folder and create DB entries for any new files found? Or only tasks created through the UI exist?

**Answer:** **Only UI-created tasks exist.** There is no file scanning. Tasks are:
1. Created via UI → DB record created → `task-{id}.md` file created
2. The file path is derived from convention (`task-{id}.md`), not stored in DB

If someone manually creates a `task-99.md` file, it will NOT appear in the UI.

---

### 6. How is context injected into conversations?

**Question:** When starting a conversation for a task, you inject `project.md` + task markdown as "initial context." Is this as a system prompt? Or as a user message? Should it be visible in the chat UI?

**Answer:**
- **Method:** Injected as a **system prompt** passed to Claude SDK
- **Visibility:** **Hidden** from the chat UI. Users do not see the injected context in the message list.
- **Format:** Combined prompt with sections for project context and task context

---

### 7. Can conversations be reassigned to different tasks?

**Question:** Once a conversation is started via a task, can it be "reassigned" to a different task?

**Answer:** **No.** Conversations are permanently linked to their task. There is no reassignment feature. If context changes, start a new conversation.

---

### 8. Where do conversations appear in the UI?

**Question:** Current sidebar shows `Project → Sessions`. New design shows `Project → Tasks`. Where do conversations appear? In sidebar as 3rd level?

**Answer:** **Conversations appear ONLY inside the Task Detail View**, not in the sidebar.

Sidebar hierarchy:
```
Project (expandable)
  └── Task 1
  └── Task 2
  └── Task 3
```

Conversations are listed in the Task Detail View's "Conversation History" section, with:
- "+" button to start a new conversation
- "Resume" button on each existing conversation

---

### 9. Can users start a conversation without selecting a task?

**Question:** Can users start a conversation for a project without selecting a task first? (Ad-hoc conversations)

**Answer:** **No.** A task must be selected first. There are no ad-hoc/taskless conversations in the new system.

User flow: Select Project → Select/Create Task → Start Conversation

---

### 10. How do Task Detail View and Chat View relate?

**Question:** Task Detail View and Chat View are separate views per spec. What's the intended navigation?

**Answer:** Sequential navigation:
1. User clicks task → **Task Detail View** appears (shows documentation + conversation list)
2. User clicks "New Conversation" or "Resume" → **Chat View** appears
3. User clicks "Back" in Chat View → Returns to **Task Detail View**

They are NOT shown side-by-side. One replaces the other in the main content area.

---

### 11. Is there a UI to edit project documentation?

**Question:** You mention `project.md` for project-level docs. Is there a UI to edit this? Where does it appear?

**Answer:** **Yes**, there is a UI to edit project documentation.

**Access methods:**
1. Click the small arrow next to a project in sidebar → Expands to show tasks (no project detail)
2. Click the project NAME in sidebar → Opens **Project Detail View** in main content
3. Project Detail View has an "Edit" button → Opens project form/editor for `project.md`

---

### 12. Should we support Cursor CLI?

**Question:** The current app supports both Claude CLI and Cursor CLI. Should the task-driven workflow apply to both providers?

**Answer:** **Claude only.** Remove Cursor CLI support entirely. The new system only works with Claude.

---

### 13. Should conversations start in "planning mode"?

**Question:** The original spec mentioned "Begin in planning mode and assist with implementation." Should the context injection force Claude into planning mode?

**Answer:** **No.** The context injection is just informational context (project + task documentation). It does NOT force any specific mode. Claude operates normally with the injected context as background information.

---

### 14. How are conversation messages stored?

**Question:** Should we store conversation messages in our database?

**Answer:** **No.** Claude Code CLI manages its own conversation JSON files in `~/.claude/projects/`. Our database only stores the `claude_conversation_id` to link to those files. We never duplicate message content.

---

### 15. What happens when a task is deleted?

**Question:** When deleting a task, what happens to its conversations and markdown file?

**Answer:**
- **Database:** Task record deleted, conversations cascade-deleted (FK constraint)
- **Filesystem:** `task-{id}.md` file is deleted
- **Claude files:** Conversation JSON files in `~/.claude/` are NOT deleted (orphaned but harmless)

---

## Key Decisions Summary

| # | Decision | Choice |
|---|----------|--------|
| 1 | Migration strategy | Fresh start - no auto-migration |
| 2 | Existing conversations | Ignored - not shown in new UI |
| 3 | `.claude-ui/` folder | Auto-created on project add |
| 4 | Task filename | Auto-generated: `task-{id}.md` (convention, not stored) |
| 5 | Task file template | None - blank file |
| 6 | Task metadata | Freeform markdown, title in DB only |
| 7 | Task discovery | DB only - no file scanning |
| 8 | Context injection | Hidden system prompt (informational, not mode-forcing) |
| 9 | Conversation reassignment | Not supported |
| 10 | Conversations in sidebar | No - only in Task Detail View |
| 11 | Ad-hoc conversations | Not allowed - must select task first |
| 12 | Navigation flow | Task Detail → Chat View (sequential, not side-by-side) |
| 13 | Project documentation UI | Yes - via Project Detail View with edit button |
| 14 | Cursor CLI | Removed - Claude only |
| 15 | Planning mode on start | No - just informational context |
| 16 | Message storage | No duplication - Claude CLI manages JSON files |
| 17 | Task deletion behavior | Cascade DB + delete markdown, orphan Claude files |
| 18 | Multiple async conversations | Supported - WebSocket streams stay active |
| 19 | Folder path source | Always from Project.repo_folder_path |
| 20 | Testing | Unit tests for all new features (Vitest) |

---

## Architecture

### Database Schema (3 new tables)

**`projects`** - User-created projects pointing to repo folders
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `user_id` (INTEGER, FK to users.id)
- `name` (TEXT, display name)
- `repo_folder_path` (TEXT, UNIQUE, absolute path to repo)
- `created_at`, `updated_at` (DATETIME)

**`tasks`** - Work items belonging to projects
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `project_id` (INTEGER, FK to projects.id, CASCADE DELETE)
- `title` (TEXT, optional display title)
- `created_at`, `updated_at` (DATETIME)
- Note: Documentation stored at `.claude-ui/tasks/task-{id}.md` (convention, not in DB)

**`conversations`** - Links Claude sessions to tasks
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `task_id` (INTEGER, FK to tasks.id, CASCADE DELETE)
- `claude_conversation_id` (TEXT, the session ID from Claude SDK)
- `created_at` (DATETIME)

**Design Note:** The original spec proposed storing `markdown_file_path` in the tasks table. This was changed to a convention-based approach (`task-{id}.md`) to simplify the model - the path is derived, not stored.

### Folder Path Mapping

Claude Code SDK requires a folder path for every conversation. This path **always comes from the Project model**:

```
Project.repo_folder_path → passed to Claude SDK as cwd
```

Even though Tasks conceptually "own" conversations, Claude only sees the project folder. The task context is injected via system prompt, not via folder structure.

### File Structure Convention

```
<repo-root>/
  .claude-ui/                    # Auto-created when project added
    project.md                   # Project-level documentation (user-created)
    tasks/                       # Auto-created when project added
      task-1.md                  # Task documentation (auto-created, blank)
      task-2.md
      ...
```

### API Structure

All new endpoints use `/api/v2/` prefix to coexist with legacy endpoints.

| Resource | Endpoints |
|----------|-----------|
| Projects | `GET/POST /api/v2/projects`, `GET/PUT/DELETE /api/v2/projects/:id` |
| Project Docs | `GET/PUT /api/v2/projects/:id/documentation` |
| Tasks | `GET/POST /api/v2/projects/:projectId/tasks`, `GET/PUT/DELETE /api/v2/tasks/:id` |
| Task Docs | `GET/PUT /api/v2/tasks/:id/documentation` |
| Conversations | `GET/POST /api/v2/tasks/:taskId/conversations`, `GET/DELETE /api/v2/conversations/:id` |

### UI Navigation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR                          │ MAIN CONTENT                 │
├──────────────────────────────────┼──────────────────────────────┤
│                                  │                              │
│ ▶ Project A  ←(click name)───────┼──→ Project Detail View       │
│   └── Task 1  ←(click)───────────┼──→ Task Detail View          │
│   └── Task 2                     │       │                      │
│                                  │       ▼ (click New/Resume)   │
│ ▼ Project B  ←(click arrow)      │    Chat View                 │
│   └── Task 3                     │       │                      │
│   └── Task 4                     │       ▼ (click Back)         │
│                                  │    Task Detail View          │
└──────────────────────────────────┴──────────────────────────────┘
```

**View Components:**
- **Project Detail View:** Project name, edit button, task list, "New Task" button
- **Task Detail View:** Breadcrumb, task documentation (editable), conversation history with +/Resume buttons
- **Chat View:** Breadcrumb, back button, ChatInterface component

### Context Injection Flow

**Starting a NEW conversation:**
```
1. User clicks "New Conversation" on Task Detail View
2. Frontend sends WebSocket message:
   { type: 'claude-command', options: { taskId, isNewConversation: true } }
3. Backend:
   a. Look up task → get project → get repo_folder_path
   b. Create conversation record in DB (get conversation.id)
   c. Read {repo}/.claude-ui/project.md
   d. Read {repo}/.claude-ui/tasks/task-{taskId}.md
   e. Build combined system prompt
   f. Call Claude SDK with customSystemPrompt option
   g. On first SDK message, capture session_id
   h. Update conversation record with claude_conversation_id = session_id
4. Streaming proceeds normally
```

**Resuming an EXISTING conversation:**
```
1. User clicks "Resume" on a conversation in Task Detail View
2. Frontend sends WebSocket message:
   { type: 'claude-command', options: { conversationId, isNewConversation: false } }
3. Backend:
   a. Look up conversation → get claude_conversation_id
   b. Call Claude SDK with resume: claude_conversation_id
   (No context injection needed - already in conversation history)
4. Streaming proceeds normally
```

---

## Implementation Phases

### Phase 0: Testing Setup
**Status:** `[x] DONE`

**What:** Set up Vitest testing framework for the project.

**Files to create:**
- `vitest.config.js` - Vitest configuration with React plugin, jsdom environment
- `src/test/setup.js` - React Testing Library setup
- `server/test/db-helper.js` - Utilities for in-memory test database

**Changes to existing files:**
- `package.json` - Add test dependencies and scripts

**Dependencies to install:**
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `supertest`

---

### Phase 1: Database Layer
**Status:** `[x] DONE`

**What:** Add new database tables and CRUD operations.

**Files to modify:**
- `server/database/init.sql` - Add CREATE TABLE statements for `projects`, `tasks`, `conversations`
- `server/database/db.js` - Add `projectsDb`, `tasksDb`, `conversationsDb` exports

**New operations to implement:**

| Object | Methods |
|--------|---------|
| `projectsDb` | `create(userId, name, repoFolderPath)`, `getAll(userId)`, `getById(id, userId)`, `update(id, userId, updates)`, `delete(id, userId)` |
| `tasksDb` | `create(projectId, title)`, `getByProject(projectId)`, `getById(id)`, `getWithProject(taskId)` (JOIN), `update(id, updates)`, `delete(id)` |
| `conversationsDb` | `create(taskId)`, `getByTask(taskId)`, `getById(id)`, `updateClaudeId(id, claudeConversationId)`, `delete(id)` |

**Tests:** `server/database/db.test.js`

---

### Phase 2: Documentation Service
**Status:** `[x] DONE`

**What:** Create service for reading/writing `.claude-ui/` files.

**Files to create:**
- `server/services/documentation.js`

**Functions to implement:**

| Function | Description |
|----------|-------------|
| `ensureClaudeUIFolder(repoPath)` | Create `.claude-ui/` and `.claude-ui/tasks/` if not exist |
| `readProjectDoc(repoPath)` | Read `.claude-ui/project.md`, return empty string if missing |
| `writeProjectDoc(repoPath, content)` | Write `.claude-ui/project.md` |
| `readTaskDoc(repoPath, taskId)` | Read `.claude-ui/tasks/task-{taskId}.md`, return empty string if missing |
| `writeTaskDoc(repoPath, taskId, content)` | Write `.claude-ui/tasks/task-{taskId}.md` |
| `deleteTaskDoc(repoPath, taskId)` | Delete `.claude-ui/tasks/task-{taskId}.md` |
| `buildContextPrompt(repoPath, taskId)` | Combine project + task docs into system prompt string |

**Tests:** `server/services/documentation.test.js`

---

### Phase 3: Backend API Routes
**Status:** `[x] DONE`

**What:** Create REST API endpoints for projects, tasks, and conversations.

**Files to create:**
- `server/routes/projects-v2.js` - Project CRUD + documentation
- `server/routes/tasks.js` - Task CRUD + documentation
- `server/routes/conversations.js` - Conversation CRUD

**Files to modify:**
- `server/index.js` - Register new routes with `/api/v2/` prefix

**Route implementations should:**
- Use `authenticateToken` middleware
- Call appropriate `*Db` functions
- Call documentation service for file operations
- Auto-create `.claude-ui/` on project creation
- Auto-create `task-{id}.md` on task creation
- Delete `task-{id}.md` on task deletion

**Tests:** `server/routes/projects-v2.test.js`, `server/routes/tasks.test.js`, `server/routes/conversations.test.js`

---

### Phase 4: SDK Context Injection
**Status:** `[ ] TO-DO`

**What:** Modify Claude SDK integration to support custom system prompts.

**Files to modify:**
- `server/claude-sdk.js`
  - Modify `mapCliOptionsToSDK()` (~line 28): Accept `customSystemPrompt` option
  - When provided, use custom prompt instead of default `'claude_code'` preset

- `server/index.js`
  - Modify WebSocket `claude-command` handler (~line 695)
  - Add handling for new options: `taskId`, `conversationId`, `isNewConversation`
  - Implement new conversation flow (create record, build context, inject prompt)
  - Implement resume flow (look up `claude_conversation_id`)

**Tests:** `server/claude-sdk.test.js`, `server/websocket-handler.test.js`

---

### Phase 5: Frontend API Client
**Status:** `[ ] TO-DO`

**What:** Add API client functions for new endpoints.

**Files to modify:**
- `src/utils/api.js` - Add `projectsV2`, `tasks`, `conversations` objects

**API methods to add:**

| Object | Methods |
|--------|---------|
| `api.projectsV2` | `list()`, `create(name, repoFolderPath)`, `get(id)`, `update(id, data)`, `delete(id)`, `getDoc(id)`, `saveDoc(id, content)` |
| `api.tasks` | `list(projectId)`, `create(projectId, title)`, `get(id)`, `update(id, data)`, `delete(id)`, `getDoc(id)`, `saveDoc(id, content)` |
| `api.conversations` | `list(taskId)`, `create(taskId)`, `get(id)`, `delete(id)` |

**Tests:** `src/utils/api.test.js`

---

### Phase 6: Frontend State Management
**Status:** `[ ] TO-DO`

**What:** Create new context and update App state for task-driven navigation.

**Files to create:**
- `src/contexts/TaskContext.jsx` - New context for projects, tasks, conversations state

**Files to modify:**
- `src/App.jsx`
  - Replace `selectedSession` state with `selectedTask` and `activeConversation`
  - Add `currentView` derived state
  - Wrap app with `TaskContextProvider`

**TaskContext state:**
- `projects`, `tasks`, `conversations` (arrays)
- `isLoadingProjects`, `isLoadingTasks`, `isLoadingConversations` (booleans)
- Actions: `loadProjects`, `createProject`, `updateProject`, `deleteProject`
- Actions: `loadTasks`, `createTask`, `updateTask`, `deleteTask`
- Actions: `loadConversations`, `createConversation`, `deleteConversation`
- Actions: `loadProjectDoc`, `saveProjectDoc`, `loadTaskDoc`, `saveTaskDoc`

**Tests:** `src/contexts/TaskContext.test.jsx`

---

### Phase 7: Frontend Components
**Status:** `[ ] TO-DO`

**What:** Create new UI components and modify existing ones.

**Files to create:**

| Component | File | Purpose |
|-----------|------|---------|
| ProjectDetailView | `src/components/ProjectDetailView.jsx` | Project name, edit button, task list, "New Task" button |
| TaskDetailView | `src/components/TaskDetailView.jsx` | Breadcrumb, task docs (editable), conversation history |
| ConversationList | `src/components/ConversationList.jsx` | List with timestamp, preview, +/Resume buttons |
| MarkdownEditor | `src/components/MarkdownEditor.jsx` | View/edit toggle, save/cancel buttons |
| ProjectForm | `src/components/ProjectForm.jsx` | Modal for create/edit project |
| TaskForm | `src/components/TaskForm.jsx` | Modal for create task |
| Breadcrumb | `src/components/Breadcrumb.jsx` | Clickable navigation path |

**Files to modify:**

| Component | Changes |
|-----------|---------|
| `src/components/Sidebar.jsx` | Replace session list with task list, add project name click handler, remove Cursor support |
| `src/components/MainContent.jsx` | Add view routing based on `currentView`, render ProjectDetailView/TaskDetailView/ChatView |
| `src/components/ChatInterface.jsx` | Accept `conversation` prop instead of `session`, add breadcrumb, update WebSocket message format |

**Tests:** `src/components/*.test.jsx` for each new component

---

### Phase 8: Cleanup
**Status:** `[ ] TO-DO`

**What:** Remove Cursor CLI support and verify no regressions.

**Files to modify:**
- `server/projects.js`
  - Remove `getCursorSessions()` function (~lines 1033-1141)
  - Remove Cursor-related imports (`sqlite3`, `open`)
  - Keep Claude session discovery for backward compatibility

- `src/components/Sidebar.jsx`
  - Remove Cursor session rendering logic
  - Remove provider icons

**Verification:**
- Run full test suite
- Manual testing via Playwright MCP

---

## Testing Strategy

**Framework:** Vitest (fast, Vite-native, Jest-compatible API)

**Backend Tests:**
- Use `supertest` for HTTP endpoint testing
- Use in-memory SQLite for database tests
- Mock file system operations where needed

**Frontend Tests:**
- Use `@testing-library/react` for component testing
- Mock API calls with `vi.fn()`
- Test user interactions and state changes

**Test Files:**

| Phase | Test Files |
|-------|------------|
| 1 | `server/database/db.test.js` |
| 2 | `server/services/documentation.test.js` |
| 3 | `server/routes/projects-v2.test.js`, `server/routes/tasks.test.js`, `server/routes/conversations.test.js` |
| 4 | `server/claude-sdk.test.js`, `server/websocket-handler.test.js` |
| 5 | `src/utils/api.test.js` |
| 6 | `src/contexts/TaskContext.test.jsx` |
| 7 | `src/components/Breadcrumb.test.jsx`, `src/components/MarkdownEditor.test.jsx`, `src/components/ConversationList.test.jsx`, `src/components/ProjectDetailView.test.jsx`, `src/components/TaskDetailView.test.jsx`, `src/components/ProjectForm.test.jsx`, `src/components/TaskForm.test.jsx` |

**Running Tests:**
```bash
npm test              # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report
```

---

## Progress Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Testing Setup | `[x] DONE` |
| 1 | Database Layer | `[x] DONE` |
| 2 | Documentation Service | `[x] DONE` |
| 3 | Backend API Routes | `[x] DONE` |
| 4 | SDK Context Injection | `[ ] TO-DO` |
| 5 | Frontend API Client | `[ ] TO-DO` |
| 6 | Frontend State Management | `[ ] TO-DO` |
| 7 | Frontend Components | `[ ] TO-DO` |
| 8 | Cleanup | `[ ] TO-DO` |

---

## Quick Reference: Files

### Backend - Existing (to modify)
| File | Changes |
|------|---------|
| `server/database/init.sql` | Add 3 new tables |
| `server/database/db.js` | Add `projectsDb`, `tasksDb`, `conversationsDb` |
| `server/claude-sdk.js` | Add `customSystemPrompt` support in `mapCliOptionsToSDK()` |
| `server/index.js` | Register routes, update WebSocket handler |
| `server/projects.js` | Remove Cursor code (~lines 1033-1141) |

### Backend - New
| File | Purpose |
|------|---------|
| `server/services/documentation.js` | File I/O for `.claude-ui/` folder |
| `server/routes/projects-v2.js` | Project CRUD endpoints |
| `server/routes/tasks.js` | Task CRUD endpoints |
| `server/routes/conversations.js` | Conversation CRUD endpoints |

### Frontend - Existing (to modify)
| File | Changes |
|------|---------|
| `src/utils/api.js` | Add v2 API methods |
| `src/App.jsx` | New state: `selectedTask`, `activeConversation`, `currentView` |
| `src/components/Sidebar.jsx` | Tasks instead of sessions, project name click |
| `src/components/MainContent.jsx` | View routing |
| `src/components/ChatInterface.jsx` | `conversation` prop, breadcrumb |

### Frontend - New
| File | Purpose |
|------|---------|
| `src/contexts/TaskContext.jsx` | State management for projects/tasks/conversations |
| `src/components/ProjectDetailView.jsx` | Project detail page |
| `src/components/TaskDetailView.jsx` | Task detail page |
| `src/components/ConversationList.jsx` | Conversation list component |
| `src/components/MarkdownEditor.jsx` | Markdown view/edit component |
| `src/components/ProjectForm.jsx` | Project create/edit modal |
| `src/components/TaskForm.jsx` | Task create modal |
| `src/components/Breadcrumb.jsx` | Navigation breadcrumb |
