# Rotten Tests Report

This document tracks test files that contain "rotten tests" - tests that test themselves rather than actual application code.

## Summary

- **Total test files analyzed:** 26
- **Originally rotten:** 14 files
- **Properly refactored:** 9 files ✅
- **Still rotten (logic-only tests):** 3 files ⚠️
- **Deleted (obsolete):** 2 files 🗑️
- **Valid tests:** 12 files

### The Problem

Rotten tests define their own data structures and functions locally within the test file, then test those locally-defined implementations instead of importing and testing actual application code. These tests will always pass regardless of whether the actual application works correctly.

---

## Important Context: Board UX Rewrite

This branch contains a **major navigation UX rewrite**. The app transitioned from:

- **Old UX:** List view with collapsible/expandable projects showing tasks inline
- **New UX:** Board view with Kanban-style columns (Pending, In Progress, Completed) and card-based navigation

### Navigation Flow (New UX)

1. **Dashboard** → Grid of project cards
2. **Board View** → Kanban columns for a selected project
3. **Task Detail** → Task documentation and conversation list
4. **Chat Interface** → Full conversation with Claude

### Three Scenarios for Each Test File

When evaluating each rotten test file, determine which scenario applies:

| Scenario | Action | Description |
|----------|--------|-------------|
| **1. Fully Outdated** | 🗑️ DELETE | Entire test file tests old list-view patterns that no longer exist |
| **2. Partially Outdated** | ✂️ CLEANUP | Some tests are relevant, others test old patterns - remove outdated, keep relevant |
| **3. Relevant but Rotten** | 🔧 REFACTOR | Tests features still in use but uses self-contained test pattern - rewrite to test actual components |

---

## Identified Rotten Test Files

### Frontend Component Tests (14 rotten)

All frontend component tests exhibit the rotten test pattern. They define logic inline and test it instead of importing actual React components.

#### 1. `src/components/Dashboard/Dashboard.test.jsx`
**Issue:** Defines `setViewMode`, `toggleProject`, `groupByStatus` functions locally instead of testing the actual Dashboard component.

Example problematic pattern:
```javascript
it('should toggle between project and status views', () => {
  let viewMode = 'project';
  const setViewMode = (mode) => { viewMode = mode; };
  setViewMode('status');
  expect(viewMode).toBe('status');
});
```

#### 2. `src/components/Dashboard/CompletedCollapse.test.jsx`
**Issue:** Defines toggle functions and state management locally instead of testing the actual component.

Example:
```javascript
it('should toggle collapse state', () => {
  let isCollapsed = true;
  const toggleCollapse = () => { isCollapsed = !isCollapsed; };
  toggleCollapse();
  expect(isCollapsed).toBe(false);
});
```

#### 3. `src/components/Dashboard/InProgressSection.test.jsx`
**Issue:** Tests simple boolean logic without rendering the actual component.

Example:
```javascript
it('should render loading state when isLoading=true and no tasks', () => {
  const tasks = [];
  const isLoading = true;
  const shouldShowLoading = isLoading && tasks.length === 0;
  expect(shouldShowLoading).toBe(true);
});
```

#### 4. `src/components/Dashboard/ProjectCard.test.jsx`
**Issue:** Defines toggle logic and chevron rotation logic locally.

Example:
```javascript
it('should show down chevron when expanded', () => {
  const isExpanded = true;
  const chevronClass = isExpanded ? 'rotate-0' : '-rotate-90';
  expect(chevronClass).toBe('rotate-0');
});
```

#### 5. `src/components/Dashboard/TaskRow.test.jsx`
**Issue:** Defines a complete `formatTimeAgo` function (20+ lines) locally instead of testing the component.

Example:
```javascript
it('should format minutes correctly', () => {
  const formatTimeAgo = (date) => {
    // 20+ lines of implementation
  };
  expect(formatTimeAgo(fiveMinutesAgo)).toBe('5m ago');
});
```

#### 6. `src/components/Dashboard/ViewToggle.test.jsx`
**Issue:** Defines validation functions and mode-switching logic locally.

Example:
```javascript
it('should accept valid view modes', () => {
  const validModes = ['project', 'in_progress'];
  const isValidMode = (mode) => validModes.includes(mode);
  expect(isValidMode('project')).toBe(true);
});
```

#### 7. `src/components/Dashboard/EmptyColumnIllustration.test.jsx`
**Issue:** Defines complete `illustrations` configuration object locally and tests selection logic.

#### 8. `src/components/Dashboard/BoardTaskCard.test.jsx`
**Issue:** Contains a complete `extractPreview` function definition (33 lines) that duplicates component logic.

#### 9. `src/components/Dashboard/BoardColumn.test.jsx`
**Issue:** Defines complete `statusConfig` object (27 lines) and tests selection logic from local object.

#### 10. `src/components/Dashboard/BoardView.test.jsx`
**Issue:** Defines complete `groupTasksByStatus` function (18 lines) and tests it locally.

#### 11. `src/components/Settings.test.jsx`
**Issue:** Defines `addAllowedTool`, `removeAllowedTool`, `validateMcpJson`, `parseEnvVars`, `getTransportType` functions locally.

#### 12. `src/components/TaskDetailView.test.jsx`
**Issue:** Defines STATUS_OPTIONS locally and tests basic object manipulation.

#### 13. `src/components/ProjectEditPage.test.jsx`
**Issue:** Tests basic JavaScript property access instead of component initialization.

#### 14. `src/components/TaskEditPage.test.jsx`
**Issue:** Defines STATUS_OPTIONS locally and tests trivial JavaScript operations.

---

## Valid Test Files (12)

The following test files properly import and test actual application code:

### Frontend
- `src/utils/api.test.js` - Properly imports and tests the actual API module

### Backend (all valid)
- `server/routes/projects.test.js`
- `server/routes/conversations.test.js`
- `server/routes/tasks.test.js`
- `server/services/documentation.test.js`
- `server/services/sessions.test.js`
- `server/websocket-handler.test.js`
- `server/claude-sdk.test.js`
- `server/database/db.test.js`
- `server/middleware/auth.test.js`
- `server/utils/commandParser.test.js`

### E2E
- `e2e/hello-world-workflow.spec.js` - Properly tests actual application through UI

---

## How to Fix Rotten Tests

A proper test should:

1. **Import actual components:**
   ```javascript
   import { render, screen, fireEvent } from '@testing-library/react';
   import Dashboard from './Dashboard';
   ```

2. **Render the actual component:**
   ```javascript
   it('should toggle view mode when button clicked', () => {
     render(<Dashboard />);
     fireEvent.click(screen.getByRole('button', { name: /status view/i }));
     expect(screen.getByTestId('status-view')).toBeInTheDocument();
   });
   ```

3. **Assert on actual rendered output**, not locally-defined variables.

---

## Classification & Status Tracker

| Test File | Scenario | Status | Notes |
|-----------|----------|--------|-------|
| `Dashboard.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 19 proper component tests |
| `CompletedCollapse.test.jsx` | 🗑️ DELETE | ✅ Done | Deleted - component not imported anywhere |
| `InProgressSection.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 14 proper component tests |
| `ProjectCard.test.jsx` | 🗑️ DELETE | ✅ Done | Deleted - replaced by ProjectCardGrid |
| `TaskRow.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 24 proper component tests |
| `ViewToggle.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 10 proper component tests |
| `EmptyColumnIllustration.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 11 proper component tests |
| `BoardTaskCard.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 25 proper component tests |
| `BoardColumn.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 22 proper component tests |
| `BoardView.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 20 proper component tests |
| `Settings.test.jsx` | 🔧 REFACTOR | ⚠️ Still Rotten | 22 logic-only tests - does NOT import or render `<Settings />` |
| `TaskDetailView.test.jsx` | 🔧 REFACTOR | ✅ Done | Refactored - 26 proper component tests |
| `ProjectEditPage.test.jsx` | 🔧 REFACTOR | ⚠️ Still Rotten | 19 logic-only tests - does NOT import or render `<ProjectEditPage />` |
| `TaskEditPage.test.jsx` | 🔧 REFACTOR | ⚠️ Still Rotten | 24 logic-only tests - does NOT import or render `<TaskEditPage />` |

---

## Still Rotten: Details

The following 3 test files still exhibit the rotten test pattern. They test inline-defined logic rather than importing and rendering the actual React components.

### `Settings.test.jsx` ⚠️

**Problem:** Defines and tests functions like `addTool`, `removeTool`, `validateMcpJson`, `parseEnvVars` inline. Never imports or renders the `<Settings />` component.

**What's untested:**
- Settings modal opening/closing
- Tab navigation between Tools/MCP/Editor settings
- Form interactions (adding/removing tools)
- Save/cancel button functionality
- Theme toggle behavior

**To fix:** Mock `useTheme` and render `<Settings isOpen={true} />`, then test actual user interactions.

### `ProjectEditPage.test.jsx` ⚠️

**Problem:** Tests validation logic and change detection using inline-defined variables. Never imports or renders the `<ProjectEditPage />` component.

**What's untested:**
- Form rendering with current project values
- User typing in name input
- Documentation editor behavior
- Save button enabling/disabling based on changes
- Delete confirmation flow
- Keyboard shortcuts (Ctrl+S, Escape)

**To fix:** Mock `useTaskContext` and render `<ProjectEditPage />`, then test form interactions.

### `TaskEditPage.test.jsx` ⚠️

**Problem:** Tests validation logic and change detection using inline-defined variables. Never imports or renders the `<TaskEditPage />` component.

**What's untested:**
- Form rendering with current task values
- User typing in title input
- Status dropdown selection
- Documentation editor behavior
- Save/delete button functionality
- Keyboard shortcuts

**To fix:** Mock `useTaskContext` and render `<TaskEditPage />`, then test form interactions.
