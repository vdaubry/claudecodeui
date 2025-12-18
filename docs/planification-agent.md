# Planification Agent Feature

## Status: Phase 1 & 2 Complete

## Overview

The Planification Agent helps users create detailed implementation plans for tasks. It runs in plan mode, asks clarifying questions, and produces a comprehensive onboarding document that any developer can use to complete the task.

---

## Phase 1: Core Infrastructure (COMPLETED)

### Database Schema
- [x] `task_agent_runs` table in `server/database/init.sql`
- [x] Migration in `server/database/db.js`
- [x] `agentRunsDb` operations (create, getByTask, updateStatus, linkConversation, etc.)

### Backend REST API
- [x] `server/routes/agent-runs.js` - REST endpoints
- [x] Routes registered in `server/index.js`

### Frontend API Client
- [x] `agentRuns` object in `src/utils/api.js`

### State Management
- [x] Agent runs state in `src/contexts/TaskContext.jsx`
- [x] Auto-load agent runs when selecting a task

### UI Components
- [x] `src/components/AgentSection.jsx` - Agent list with Run/Completed buttons
- [x] `src/components/TaskDetailView.jsx` - AgentSection integration
- [x] `src/components/MainContent.jsx` - handleRunAgent handler
- [x] `src/components/ChatInterface.jsx` - Plan mode detection
- [x] `src/components/MessageInput.jsx` - "Complete Plan" button

### Bug Fixes
- [x] Fixed permission mode conflict between localStorage and agent run initialization

---

## Phase 2: Enhanced Planning Agent (COMPLETED)

### Goal
Improve the planning agent to produce a comprehensive task documentation that serves as an onboarding document for new developers.

### Requirements

The planning agent should:

1. **Ask Clarifying Questions First**
   - Before producing any plan, ask all necessary questions to understand the task
   - Understand user intent, constraints, edge cases, and preferences

2. **Update Task Documentation**
   - Edit the task's documentation file directly
   - Include the path to task doc in the user message
   - Structure as an onboarding document for new developers

3. **Documentation Structure**
   The task documentation should include:

   - **Overview**: Initial user request and context
   - **Implementation Plan**: Exact plan produced, phase by phase
   - **Technical Details**: Architecture decisions, file changes, dependencies
   - **Testing Strategy**:
     - Unit tests to create or update
     - Manual testing with Playwright MCP scenarios
   - **To-Do List**: Clear progress tracking
     - Implementation steps (phase by phase)
     - Unit test creation
     - Playwright MCP manual testing scenarios

4. **Developer Onboarding Focus**
   - Assume the reader understands the codebase but knows nothing about this task
   - Include all information needed to complete the task independently
   - Allow pausing and resuming implementation with clear progress tracking

### Implementation Steps

- [x] Update hardcoded message in `AgentSection.jsx` with enhanced prompt
- [x] Include task documentation path in the message (`.claude-ui/tasks/task-{taskId}.md`)
- [x] Pass `taskId` prop from TaskDetailView to AgentSection
- [x] Prefix message with `@agent-Plan` to use Claude SDK planification sub-agent
- [x] Change from plan mode to bypassPermissions mode (so agent can write files)
- [x] Update Complete Plan button to show for all agent runs (not just plan mode)
- [x] Test the enhanced planning flow with Playwright

### Enhanced Agent Message Template

```
@agent-Plan You are helping me plan the implementation of a task. Your goal is to create a comprehensive onboarding document that any developer can use to complete this task.

## Your Process

1. **Ask Clarifying Questions First**
   Before creating any plan, ask me all questions you need to fully understand:
   - The exact requirements and expected behavior
   - Edge cases and error handling
   - Any constraints or preferences
   - Integration points with existing code

2. **Explore the Codebase**
   Once you understand the requirements, explore the codebase to understand:
   - Current implementation patterns
   - Relevant files and components
   - Testing patterns used in the project

3. **Create the Implementation Plan**
   After gathering information, update the task documentation file at:
   `[TASK_DOC_PATH]`

   Structure the document as an onboarding guide with these sections:

   ### Overview
   - Summary of what this task accomplishes
   - Initial user request and context
   - Key decisions made during planning

   ### Implementation Plan
   - Phase-by-phase breakdown
   - Files to modify/create
   - Technical approach for each phase

   ### Testing Strategy
   - Unit tests to create or update
   - Manual testing scenarios using Playwright MCP
   - Expected behavior to verify

   ### To-Do List
   Track progress with checkboxes:
   - [ ] Phase 1: [description]
   - [ ] Phase 2: [description]
   - [ ] Unit tests
   - [ ] Playwright manual testing

The documentation should be complete enough that a developer who understands the codebase but knows nothing about this specific task can implement it independently.

Please start by asking your clarifying questions.
```

---

## Files Modified (Phase 1)

| File | Status | Changes |
|------|--------|---------|
| `server/database/init.sql` | Done | Added `task_agent_runs` table |
| `server/database/db.js` | Done | Added migration + `agentRunsDb` operations |
| `server/routes/agent-runs.js` | Done | NEW - REST endpoints |
| `server/index.js` | Done | Registered agent-runs routes |
| `src/utils/api.js` | Done | Added `agentRuns` API client |
| `src/contexts/TaskContext.jsx` | Done | Added agent runs state + operations |
| `src/components/AgentSection.jsx` | Done | NEW - Agent list component |
| `src/components/TaskDetailView.jsx` | Done | Added AgentSection below docs |
| `src/components/MainContent.jsx` | Done | Added `handleRunAgent` handler |
| `src/components/ChatInterface.jsx` | Done | Plan mode detection + permission fix |
| `src/components/MessageInput.jsx` | Done | Added "Complete Plan" button |

## Files Modified (Phase 2)

| File | Status | Changes |
|------|--------|---------|
| `src/components/AgentSection.jsx` | Done | Added `generatePlanificationMessage()` function with enhanced prompt |
| `src/components/TaskDetailView.jsx` | Done | Pass `taskId` prop to AgentSection |

---

## User Flow

1. User views a task in TaskDetailView
2. Below the documentation section, they see an "Agents" section with "Planification" agent
3. If not run yet: shows "Run" button with play icon
4. Click "Run" → creates conversation in plan mode with enhanced message → navigates to chat
5. Agent asks clarifying questions
6. User answers questions
7. Agent explores codebase and creates comprehensive task documentation
8. User reviews the plan
9. Click "Complete Plan" → marks agent as completed → returns to TaskDetailView
10. Task documentation now contains the full implementation plan and to-do list

---

## Testing

### Phase 1 Testing (Completed)
- [x] Database migration creates table on server start
- [x] API endpoints work via Playwright
- [x] UI flow: Run agent → Plan mode chat → Complete Plan → Completed status

### Phase 2 Testing (Completed)
- [x] Enhanced message is sent to agent
- [x] Task doc path is correctly included (`.claude-ui/tasks/task-{taskId}.md`)
- [x] Plan Mode and Complete Plan buttons appear correctly
- [ ] Agent asks clarifying questions before planning (depends on LLM behavior)
- [ ] Agent updates task documentation file (depends on LLM behavior)
- [ ] Documentation includes all required sections (depends on LLM behavior)
