# Dashboard UI Refactor - Implementation Plan

## Overview

Replace the current sidebar-based navigation with a full-screen **Dual-View Dashboard** that provides an overview of all projects and tasks at a glance.

## Design Summary

- **No sidebar** - Dashboard IS the main view
- **Toggle between views**: "By Project" and "By Status"
- **3-screen navigation**: Dashboard → Task Detail → Chat Interface
- **Chat Interface remains unchanged** - only add back button

---

## Screen 1: Dashboard

### By Project View (Default)

- First project **unfolded** by default, others **folded**
- ▼/▶ arrow to toggle fold/unfold each project
- 🔴 indicator on project if any task has active conversation
- Task rows show: title, status badge, LIVE indicator, View button
- Collapsed "Completed (N)" section at bottom of each project

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLAUDE CODE UI                                                      │
│  ┌──────────────────┐  ┌──────────────────┐         ┌─────────────┐ │
│  │ ■  By Project    │  │ □  By Status     │         │ + New Proj  │ │
│  └──────────────────┘  └──────────────────┘         └─────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  ▼ 🔴  Claude Code UI                                   2 active     │
│      /home/ubuntu/claudecodeui                                       │
│  ────────────────────────────────────────────────────────────────── │
│  │  ●  Implement dashboard           🔴 LIVE            │ View → │ │
│  │  ●  Fix WebSocket                 In Progress        │ View → │ │
│  │  ○  Add unit tests                Pending            │ View → │ │
│  └─ Completed (5) ───────────────────────────── Expand ─┘          │
│  [+ Add Task]                                                        │
│                                                                      │
│  ▶    My Blog Project                                   1 pending    │  ← FOLDED
│                                                                      │
│  ▶ 🔴  E-commerce API                                   1 active     │  ← FOLDED
└──────────────────────────────────────────────────────────────────────┘
```

### By Status View

- Groups all tasks by status across all projects
- Shows "Project › Task" for each row
- Same sections: ACTIVE NOW, IN PROGRESS, PENDING, COMPLETED

```
┌──────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌──────────────────┐                          │
│  │ □  By Project    │  │ ■  By Status     │                          │
│  └──────────────────┘  └──────────────────┘                          │
├──────────────────────────────────────────────────────────────────────┤
│  🔴  ACTIVE NOW                                        ●●● (2 live)  │
│  ────────────────────────────────────────────────────────────────── │
│  │  Claude Code UI › Implement dashboard               │ View → │   │
│  │  E-commerce API › Implement payment                 │ View → │   │
│                                                                      │
│  🟡  IN PROGRESS                                              (1)    │
│  ────────────────────────────────────────────────────────────────── │
│  │  Claude Code UI › Fix WebSocket                     │ View → │   │
│                                                                      │
│  ⚪  PENDING                                                  (2)    │
│  ────────────────────────────────────────────────────────────────── │
│  │  Claude Code UI › Add unit tests                    │ View → │   │
│  │  My Blog Project › Add RSS feed                     │ View → │   │
│                                                                      │
│  ✓  COMPLETED                                    (5) ── Expand ─┐   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Screen 2: Task Detail View

When user clicks a task → shows this intermediate screen.

- Back button returns to Dashboard
- 🔴 badge shows count of active conversations
- Doc preview (first ~5 lines) + Edit button + Show more
- List of conversations with:
  - Status (🔴 LIVE / Paused)
  - Time since last activity
  - First few lines of first user message
  - Open/Resume button
- "+ New Conversation" button

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                    🔴 1 LIVE    │
│  Claude Code UI › Implement dashboard layout                         │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  📄 DOCUMENTATION                                      [Edit]  │  │
│  │  ## Implement Dashboard Layout                                  │  │
│  │  Replace the current sidebar-based navigation...   [Show more] │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  💬 CONVERSATIONS                        [+ New Conversation]  │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  🔴 LIVE                                        2 min ago │  │  │
│  │  │  "Can you start implementing the dashboard layout?..."    │  │  │
│  │  │                                                [Open →]   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Paused                                        Yesterday  │  │  │
│  │  │  "Let's focus on the toggle between views first..."       │  │  │
│  │  │                                               [Resume →]  │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Screen 3: Chat Interface (Unchanged)

Existing `ChatInterface.jsx` - only add "← Back to Task" button in header.

---

## Navigation Flow

```
Dashboard ──────────────────► Task Detail ──────────────────► Chat
    ◄── Back to Dashboard ────     ◄──── Back to Task ────
```

---

## Visual Indicators

| Status | Indicator |
|--------|-----------|
| 🔴 LIVE | Pulsing red dot - Claude session is streaming |
| 🟡 In Progress | Yellow - Has conversation history, not active |
| ⚪ Pending | Gray circle - No conversation started |
| ✓ Completed | Checkmark - Task marked done |

Projects with active conversations get a subtle glow/border highlight.

---

## New Components

| Component | Purpose |
|-----------|---------|
| `src/components/Dashboard/Dashboard.jsx` | Main container with view toggle |
| `src/components/Dashboard/ViewToggle.jsx` | Project/Status toggle buttons |
| `src/components/Dashboard/ProjectCard.jsx` | Collapsible project with ▼/▶ |
| `src/components/Dashboard/TaskRow.jsx` | Task with status + LIVE indicator |
| `src/components/Dashboard/StatusSection.jsx` | Groups tasks by status |
| `src/components/Dashboard/CompletedCollapse.jsx` | Collapsed completed section |
| `src/components/TaskDetail/TaskDetailView.jsx` | Doc preview + conversation list |
| `src/components/TaskDetail/ConversationCard.jsx` | Conversation preview card |

## Modified Components

| Component | Changes |
|-----------|---------|
| `src/App.jsx` | Remove sidebar, add view routing |
| `src/components/MainContent.jsx` | Route Dashboard/TaskDetail/Chat |
| `src/components/ChatInterface.jsx` | Add back button (minimal) |

## Removed Components

| Component | Reason |
|-----------|--------|
| `src/components/Sidebar.jsx` | Replaced by Dashboard |
| `src/components/ProjectDetailView.jsx` | Merged into Dashboard |

---

## State Changes

```javascript
// App.jsx
const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'taskDetail' | 'chat'
const [dashboardViewMode, setDashboardViewMode] = useState('project'); // 'project' | 'status'
const [selectedTask, setSelectedTask] = useState(null);
const [selectedConversation, setSelectedConversation] = useState(null);
const [expandedProjects, setExpandedProjects] = useState(new Set()); // First project auto-expanded
```

---

## Implementation Steps

1. **Create Dashboard components** - Dashboard.jsx, ViewToggle.jsx, ProjectCard.jsx, TaskRow.jsx, StatusSection.jsx, CompletedCollapse.jsx

2. **Create TaskDetail components** - TaskDetailView.jsx, ConversationCard.jsx

3. **Update App routing** - Remove Sidebar, update MainContent to route Dashboard → TaskDetail → Chat

4. **Add visual indicators** - Pulsing animation, project glow, status badges

5. **Add real-time updates** - WebSocket subscription for conversation status changes
