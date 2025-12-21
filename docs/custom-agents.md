# Custom Agents Feature - Implementation Plan

## Overview

Add a "Custom Agents" feature that allows users to create reusable agent configurations (name + prompt) at the project level. Users can run conversations with these agents, with the agent's prompt serving as the Claude system prompt.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent scope | Project-scoped | Follows task pattern, keeps agents organized per project |
| Prompt usage | System prompt | Direct control over Claude's behavior |
| Prompt storage | Markdown files | Git versioning, consistent with task documentation |
| Conversation model | Nullable FKs | Single table, code reuse, referential integrity |
| State management | New AgentContext | Separation of concerns, keeps TaskContext manageable |

## Database Changes

### 1. Create `agents` table

```sql
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
```

**File storage**: Agent prompts stored at `{repo}/.claude-ui/agents/agent-{id}.md`

### 2. Modify `conversations` table

Make `task_id` nullable, add `agent_id`:

```sql
-- Migration: Recreate with nullable FKs
CREATE TABLE conversations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NULL,
    agent_id INTEGER NULL,
    claude_conversation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    CHECK ((task_id IS NULL) != (agent_id IS NULL))
);
-- Copy data, drop old, rename
```

## URL Structure

```
/projects/:projectId                                       # BoardView (Development tab)
/projects/:projectId?tab=agents                            # BoardView (Custom Agents tab)
/projects/:projectId/agents/:agentId                       # AgentDetailView
/projects/:projectId/agents/:agentId/edit                  # AgentEditPage
/projects/:projectId/agents/:agentId/chat/:conversationId  # ChatPage (agent context)
```

## Component Architecture

### New Components

| Component | Location | Based On |
|-----------|----------|----------|
| `BoardTabBar.jsx` | `/src/components/Dashboard/` | `ViewToggle.jsx` |
| `AgentsGrid.jsx` | `/src/components/Dashboard/` | Board columns container |
| `AgentCard.jsx` | `/src/components/Dashboard/` | `BoardTaskCard.jsx` |
| `AgentForm.jsx` | `/src/components/Dashboard/` | `TaskForm.jsx` |
| `AgentDetailView.jsx` | `/src/components/` | `TaskDetailView.jsx` |
| `AgentDetailPage.jsx` | `/src/pages/` | `TaskDetailPage.jsx` |
| `AgentEditPageWrapper.jsx` | `/src/pages/` | `TaskEditPageWrapper.jsx` |
| `AgentContext.jsx` | `/src/contexts/` | `TaskContext.jsx` |

### Modified Components

| Component | Changes |
|-----------|---------|
| `BoardView.jsx` | Add tab state, render AgentsGrid when tab=agents |
| `BoardPage.jsx` | Read `tab` query param |
| `ChatPage.jsx` | Support agent context (detect via URL) |
| `ConversationList.jsx` | Accept `agentId` as alternative to `taskId` |
| `Breadcrumb.jsx` | Add agent navigation case |
| `App.jsx` | Add agent routes |

### Reused Components (No Changes)

- `MarkdownEditor.jsx` - For agent prompt display/edit
- `ChatInterface.jsx` - Same chat UI, different context
- `NewConversationModal.jsx` - Same modal structure

## Backend Changes

### New Files

| File | Purpose |
|------|---------|
| `/server/routes/agents.js` | Agent CRUD + prompt endpoints |
| `/server/database/agentsDb.js` | (or add to db.js) Agent database operations |

### Modified Files

| File | Changes |
|------|---------|
| `/server/database/db.js` | Add migration, `agentsDb` operations, update `conversationsDb` |
| `/server/database/init.sql` | Add agents table definition |
| `/server/services/documentation.js` | Add agent prompt read/write functions |
| `/server/services/conversationAdapter.js` | Support agent-owned conversations, pass prompt as system prompt |
| `/server/routes/conversations.js` | Support agent conversations |
| `/server/index.js` | Register agent routes |

### API Endpoints

```
GET    /api/projects/:projectId/agents          # List agents
POST   /api/projects/:projectId/agents          # Create agent
GET    /api/agents/:id                          # Get agent
PUT    /api/agents/:id                          # Update agent
DELETE /api/agents/:id                          # Delete agent
GET    /api/agents/:id/prompt                   # Get agent prompt (markdown)
PUT    /api/agents/:id/prompt                   # Save agent prompt
GET    /api/agents/:agentId/conversations       # List agent conversations
POST   /api/agents/:agentId/conversations       # Create agent conversation
```

## State Management

### New AgentContext

```javascript
// State
agents: []                     // Agents for current project
selectedAgent: null            // Currently selected agent
agentConversations: []         // Conversations for selected agent
agentPrompt: ''                // Prompt content
isLoadingAgents: boolean
isLoadingAgentConversations: boolean

// Actions
loadAgents(projectId)
createAgent(projectId, name)
updateAgent(agentId, { name })
deleteAgent(agentId)
selectAgent(agent)
loadAgentConversations(agentId)
loadAgentPrompt(agentId)
saveAgentPrompt(agentId, content)
createAgentConversation(agentId, message?)
```

## File Structure Convention

```
{repo}/.claude-ui/
  project.md                   # Project documentation
  tasks/
    task-1.md                  # Task documentation
  agents/                      # NEW: Agent prompts directory
    agent-1.md                 # Agent prompt (markdown)
    agent-2.md
```

## Implementation Phases

### Phase 1: Database & Backend Foundation
1. Add migration in `db.js` for agents table and conversations modification
2. Add `agentsDb` operations to `db.js`
3. Update `conversationsDb` to support nullable `task_id` and new `agent_id`
4. Add agent prompt functions to `documentation.js`
5. Create `/server/routes/agents.js` with CRUD + prompt endpoints
6. Register routes in `index.js`

### Phase 2: ConversationAdapter Updates
7. Update `conversationAdapter.js` to accept agent context
8. Pass agent prompt as custom system prompt to Claude SDK
9. Update conversation creation to support `agentId`

### Phase 3: Frontend State Management
10. Create `AgentContext.jsx`
11. Add agent API functions to `api.js`
12. Add AgentProvider to `App.jsx`

### Phase 4: BoardView Tab Navigation
13. Create `BoardTabBar.jsx` component
14. Modify `BoardView.jsx` to add tab state and conditional rendering
15. Modify `BoardPage.jsx` to read tab query param
16. Create `AgentsGrid.jsx` container
17. Create `AgentCard.jsx` component
18. Create `AgentForm.jsx` modal

### Phase 5: Agent Detail View
19. Create `AgentDetailView.jsx` (split layout with ConversationList + MarkdownEditor)
20. Create `AgentDetailPage.jsx` page wrapper
21. Create `AgentEditPageWrapper.jsx` for editing
22. Add routes to `App.jsx`

### Phase 6: Agent Conversations
23. Modify `ConversationList.jsx` to accept either `taskId` or `agentId`
24. Modify `ChatPage.jsx` to detect and handle agent context
25. Update `Breadcrumb.jsx` for agent navigation

### Phase 7: Testing & Polish
26. Add unit tests for new components
27. Add E2E tests for agent workflow
28. Manual testing with Playwright MCP

## Critical Files Summary

**Backend (modify)**:
- `/server/database/db.js` - Migration, agentsDb, update conversationsDb
- `/server/database/init.sql` - Schema
- `/server/services/documentation.js` - Agent prompt I/O
- `/server/services/conversationAdapter.js` - Agent conversation support

**Backend (create)**:
- `/server/routes/agents.js` - Agent API routes

**Frontend (modify)**:
- `/src/components/Dashboard/BoardView.jsx` - Tab navigation
- `/src/pages/BoardPage.jsx` - Tab query param
- `/src/components/ConversationList.jsx` - Agent support
- `/src/pages/ChatPage.jsx` - Agent context
- `/src/App.jsx` - Routes

**Frontend (create)**:
- `/src/contexts/AgentContext.jsx`
- `/src/components/Dashboard/BoardTabBar.jsx`
- `/src/components/Dashboard/AgentsGrid.jsx`
- `/src/components/Dashboard/AgentCard.jsx`
- `/src/components/Dashboard/AgentForm.jsx`
- `/src/components/AgentDetailView.jsx`
- `/src/pages/AgentDetailPage.jsx`
- `/src/pages/AgentEditPageWrapper.jsx`

## Conversation Ownership Model

```
Task Conversations:
  conversation → task → project → user

Agent Conversations:
  conversation → agent → project → user
```

Both follow the same ownership chain pattern for permission verification.
