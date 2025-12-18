# Dashboard UX Overhaul: Trello-Style Board View

## Overview

Transform the current accordion-style project list into a modern grid-based dashboard with Kanban-style board views. This is a visual/navigation refactoring only - TaskDetailView, ChatInterface, and conversation flow remain unchanged.

---

## Initial User Intent

### Goal
The user wanted to transition from the current table/accordion-style project list to a **Trello-like UX** where:
- Projects are displayed as **cards in a grid** (dashboard level)
- Each project opens into a **Kanban board view** with columns for task status (project detail level)

### Current State (Before)
- Dashboard shows projects as collapsible accordion rows
- Expanding a project reveals tasks as table rows beneath it
- Dark, dull UI that needs visual refresh

### Desired State (After)
- Dashboard shows **2-3 project cards per row** in a responsive grid
- Clicking a project card opens a **board view** with 3 columns (Pending, In Progress, Completed)
- Tasks displayed as cards stacked within columns
- Beautiful, modern Tailwind CSS styling

### Constraints Specified by User
- **No drag-and-drop** between columns (V0 scope)
- **No double horizontal scrolling** - page scrolls, not individual columns
- **Desktop**: 3 columns visible, no horizontal scroll
- **Mobile**: 1 column at a time with CSS scroll-snap (pure CSS, no JS)
- **Keep existing pages unchanged**: TaskDetailView, ChatInterface, conversation flow
- **Keep "In Progress" global view**: Cross-project view showing all in-progress tasks

---

## UX Brainstorming Q&A

### Questions Asked by Assistant

#### Project Cards (Dashboard Grid)

**Q1: Documentation preview - how to handle markdown?**
> **A:** First ~2 lines of **plain text** (strip markdown formatting)

**Q2: Task count badges - clickable to jump to status column?**
> **A:** **Clickable** to navigate directly to that status column in board view

**Q3: Edit button behavior - modal or dedicated page?**
> **A:** Navigates to a **dedicated edit page** (not modal)

#### Task Cards (Board View)

**Q4: Task card click - opens what?**
> **A:** Opens the **Task Detail View** with conversations. Edit button opens edit page form.

**Q5: Task card content - what information to display?**
> **A:** Title + conversation count + first line of task documentation + **LIVE indicator**

**Q6: Status changes - how do users move tasks between columns?**
> **A:** Via existing **Task Detail page dropdown** (no drag-and-drop in V0). Reuse task detail page as-is.

#### Columns & Layout

**Q7: Future statuses - will there be more than 3 columns?**
> **A:** Only **3 columns** (Pending / In Progress / Completed) - fixed, no future expansion

**Q8: Empty column state - what to show?**
> **A:** **Decorative SVG illustration**

**Q9: Column scrolling - if one column has many tasks?**
> **A:** **Page gets tall** - whole page scrolls vertically, not individual columns

#### Mobile-Specific

**Q10: Column indicator on mobile - how does user know there are more columns?**
> **A:** **Pure CSS only** - show partial edge of next column as hint (no dots indicator, no JS)

**Q11: "New Task" button placement on mobile?**
> **A:** User lets assistant decide optimal UX for single "New Task" button

#### Navigation & State

**Q12: Back navigation from board view?**
> **A:** **Breadcrumb** (existing breadcrumb pattern in task detail view)

**Q13: LIVE indicator preservation - where does it appear?**
> **A:** On the **task card** in board view

### Additional Decisions Made

**Q14: Status badge click behavior?**
> **A:** **Navigate only** - just open board view, no auto-scroll to specific column

**Q15: "In Progress" global view - keep or remove?**
> **A:** **Keep as global view** - preserve cross-project "In Progress" view as a separate tab

**Q16: Mobile dots indicator - JS acceptable?**
> **A:** **Pure CSS only** - no JS for scroll position detection, users see partial column edge instead

**Q17: Empty column illustrations - style preference?**
> **A:** **Decorative SVG illustrations** (visually engaging, not just icon + text)

**Q18: "New Task" button placement in Board View?**
> **A:** **Header only** - single button always visible in board header (not in column)

---

## Technical Approach Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| CSS Grid for dashboard | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` | Responsive, 1-3 columns based on screen |
| Mobile scroll-snap | `scroll-snap-type: x mandatory` | Pure CSS, no JS dependency |
| Column hint on mobile | `w-[calc(100vw-3rem)]` | Shows ~24px of next column edge |
| State management | New `currentView` values in TaskContext | Clean separation of views |
| Edit pages | Dedicated full-page forms (not modals) | Better mobile UX, more space for editing |
| Documentation preview | Strip markdown to plain text, 120 chars max | Clean card appearance |

---

## Scope Exclusions (Explicitly Out of Scope)

- **Drag-and-drop** between columns
- **JS-based mobile column indicators** (dots)
- **Modifications to TaskDetailView** - reuse as-is
- **Modifications to ChatInterface** - reuse as-is
- **Modifications to conversation flow** - keep unchanged
- **More than 3 status columns** - fixed at Pending/In Progress/Completed

---

## Key Decisions

| Aspect | Decision |
|--------|----------|
| Dashboard | Grid of project cards (CSS Grid, auto-fill) |
| Project Detail | Board view with 3 columns (Pending/In Progress/Completed) |
| Mobile columns | CSS scroll-snap, partial column visible as hint |
| Empty columns | Decorative SVG illustrations |
| Status badge click | Navigate to board only (no auto-scroll) |
| In Progress view | Keep global cross-project view |
| New Task button | Header area (always visible) |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/TaskContext.jsx` | Add 'board' view state, edit states, navigation functions |
| `src/components/MainContent.jsx` | Add routing for board and edit views |
| `src/components/Dashboard/Dashboard.jsx` | Replace project list with CSS Grid of cards |
| `src/components/Breadcrumb.jsx` | Update for board view navigation |
| `src/index.css` | Add scroll-snap utilities |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/components/Dashboard/ProjectCardGrid.jsx` | Grid-style project card for dashboard |
| `src/components/Dashboard/StatusBadge.jsx` | Clickable status count badge |
| `src/components/Dashboard/BoardView.jsx` | Kanban board container with 3 columns |
| `src/components/Dashboard/BoardColumn.jsx` | Single column (Pending/In Progress/Completed) |
| `src/components/Dashboard/BoardTaskCard.jsx` | Task card within board column |
| `src/components/Dashboard/EmptyColumnIllustration.jsx` | SVG illustration for empty columns |
| `src/components/ProjectEditPage.jsx` | Full-page project edit form |
| `src/components/TaskEditPage.jsx` | Full-page task edit form |

## Files to Keep Unchanged

- `src/components/TaskDetailView.jsx`
- `src/components/ChatInterface.jsx`
- `src/components/ConversationList.jsx`
- `src/components/Dashboard/InProgressSection.jsx`
- `src/components/Dashboard/TaskRow.jsx` (used by InProgressSection)

---

## Implementation Phases

### Phase 1: State Management Foundation

**File: `src/contexts/TaskContext.jsx`**

1. Add new state variables:
```javascript
const [editingProject, setEditingProject] = useState(null);
const [editingTask, setEditingTask] = useState(null);
```

2. Update `getCurrentView()`:
```javascript
const getCurrentView = useCallback(() => {
  if (activeConversation) return 'chat';
  if (editingTask) return 'task-edit';
  if (editingProject) return 'project-edit';
  if (selectedTask) return 'task-detail';
  if (selectedProject) return 'board'; // Changed from 'project-detail'
  return 'empty';
}, [activeConversation, selectedTask, selectedProject, editingTask, editingProject]);
```

3. Add navigation functions:
- `navigateToBoard(project)` - Opens board view
- `navigateToProjectEdit(project)` - Opens project edit page
- `navigateToTaskEdit(task)` - Opens task edit page
- `exitEditMode()` - Returns from edit pages

**File: `src/components/MainContent.jsx`**

Add view routing:
```javascript
if (currentView === 'board') return <BoardView />;
if (currentView === 'project-edit') return <ProjectEditPage />;
if (currentView === 'task-edit') return <TaskEditPage />;
```

---

### Phase 2: Project Cards Grid

**File: `src/components/Dashboard/StatusBadge.jsx`**

Clickable badge component showing task count by status:
- Props: `status`, `count`, `onClick`
- Colors: gray (pending), yellow (in_progress), green (completed)
- Hover effect, cursor pointer

**File: `src/components/Dashboard/ProjectCardGrid.jsx`**

Project card for dashboard grid:
- Props: `project`, `taskCounts`, `docPreview`, `hasLiveTask`, `onCardClick`, `onEditClick`, `onDeleteClick`, `onStatusBadgeClick`
- Layout: Name, status badges row, 2-line doc preview, edit/delete buttons
- Click card body → board view
- Click edit button → edit page
- Styling: `bg-gradient-to-br`, `hover:shadow-lg`, `rounded-xl`

**File: `src/components/Dashboard/Dashboard.jsx`**

Replace project list with CSS Grid:
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
  {/* Or: repeat(auto-fill, minmax(300px, 1fr)) */}
  {projects.map(project => (
    <ProjectCardGrid key={project.id} ... />
  ))}
</div>
```

Keep ViewToggle with "By Project" (grid) and "In Progress" modes.

---

### Phase 3: Board View (Kanban)

**File: `src/components/Dashboard/EmptyColumnIllustration.jsx`**

SVG illustrations for empty columns:
- Pending: Empty clipboard
- In Progress: Progress indicator
- Completed: Checkmark/trophy

**File: `src/components/Dashboard/BoardTaskCard.jsx`**

Task card within columns:
- Props: `task`, `isLive`, `conversationCount`, `docPreview`, `onClick`, `onEditClick`
- Content: Title (bold), conversation count, 1-line doc preview, LIVE indicator
- Click body → task detail, click edit → task edit page

**File: `src/components/Dashboard/BoardColumn.jsx`**

Single column component:
- Props: `status`, `title`, `tasks`, `icon`, `color`, `onTaskClick`, `onTaskEdit`
- Header with icon, title, count
- Task list or empty illustration

**File: `src/components/Dashboard/BoardView.jsx`**

Main board container:
- Props: `project`, `tasks`, callbacks
- Header: Breadcrumb (Home > Project), "New Task" button
- 3 columns: Pending, In Progress, Completed

**CSS Layout (Mobile scroll-snap):**
```jsx
<div className={cn(
  // Mobile: horizontal scroll-snap
  "flex gap-4 p-4 overflow-x-auto",
  "[scroll-snap-type:x_mandatory]",
  "[-webkit-overflow-scrolling:touch]",
  "scrollbar-hide",
  // Desktop: 3-column grid
  "md:grid md:grid-cols-3 md:overflow-visible",
  "md:[scroll-snap-type:none]"
)}>
```

**Column width (partial visibility hint):**
```jsx
<div className={cn(
  "flex-shrink-0 w-[calc(100vw-3rem)]",
  "[scroll-snap-align:start]",
  "md:w-auto md:flex-shrink"
)}>
```

**File: `src/index.css`**

Add to `@layer utilities`:
```css
.snap-x-mandatory {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.snap-start {
  scroll-snap-align: start;
}
```

---

### Phase 4: Edit Pages

**File: `src/components/ProjectEditPage.jsx`**

Full-page project edit form:
- Header with back button
- Name input field
- Documentation markdown editor (reuse MarkdownEditor)
- Save/Cancel buttons
- Delete button with confirmation

**File: `src/components/TaskEditPage.jsx`**

Full-page task edit form:
- Header with back button
- Title input field
- Status dropdown (Pending/In Progress/Completed)
- Documentation markdown editor
- Save/Cancel buttons
- Delete button with confirmation

---

### Phase 5: Styling Polish

Apply beautiful Tailwind CSS throughout:

**Project Cards:**
- `bg-gradient-to-br from-card to-card/80`
- `hover:shadow-lg hover:border-primary/30 transition-all`
- `rounded-xl border border-border`

**Board Columns:**
- Column header with status color indicator
- `bg-card rounded-lg border border-border`
- Subtle shadows on task cards

**Task Cards:**
- `hover:bg-accent/50 transition-colors`
- LIVE indicator: `animate-pulse` red dot
- `shadow-sm hover:shadow`

**Empty States:**
- Centered illustration
- `text-muted-foreground` message

---

### Phase 6: Testing & Cleanup

1. Update unit tests for modified components
2. Update E2E tests for new navigation flow
3. Test mobile scroll-snap on real devices
4. Remove deprecated `ProjectCard.jsx`
5. Update component exports

---

## Component Hierarchy (New)

```
Dashboard
├─ Header (Logo, Settings, New Project)
├─ ViewToggle ("By Project" | "In Progress")
└─ Content
   ├─ ProjectCardGrid[] (grid of cards)
   └─ InProgressSection (cross-project view)

BoardView (when project selected)
├─ Header (Breadcrumb, New Task button)
└─ Columns Container (scroll-snap on mobile)
   ├─ BoardColumn (Pending)
   │  └─ BoardTaskCard[]
   ├─ BoardColumn (In Progress)
   │  └─ BoardTaskCard[]
   └─ BoardColumn (Completed)
      └─ BoardTaskCard[]
```

---

## Navigation Flow (Updated)

```
Dashboard (empty)
    │
    ├─ Click project card → BoardView (board)
    │       │
    │       ├─ Click task card → TaskDetailView (task-detail) [unchanged]
    │       │       │
    │       │       └─ Click conversation → ChatInterface (chat) [unchanged]
    │       │
    │       └─ Click task edit → TaskEditPage (task-edit)
    │
    └─ Click project edit → ProjectEditPage (project-edit)
```

---

## Potential Challenges

| Challenge | Mitigation |
|-----------|------------|
| iOS Safari scroll-snap quirks | Use `-webkit-overflow-scrolling: touch`, test on real devices |
| Documentation preview extraction | Utility function to strip markdown, get first N chars |
| Mobile "New Task" button placement | Fixed header in BoardView, always visible |
| Long project names in breadcrumb | Truncate with `max-w-[150px]` |

---

## Success Criteria

- [x] Dashboard shows project cards in responsive grid
- [x] Clicking project card opens board view
- [ ] Board has 3 columns with task cards
- [ ] Mobile: horizontal scroll-snap between columns works smoothly
- [ ] Desktop: all 3 columns visible, page scrolls vertically
- [ ] Empty columns show decorative illustrations
- [ ] LIVE indicator visible on task cards
- [ ] Edit pages work for projects and tasks
- [x] ViewToggle switches between grid and In Progress views
- [x] TaskDetailView and ChatInterface remain unchanged
- [x] Beautiful, modern Tailwind styling throughout (Phase 2 complete, ongoing)

---

## Implementation Progress

### Phase 1: State Management Foundation - COMPLETE

**Files Modified:**
- `src/contexts/TaskContext.jsx`
  - Added `editingProject` and `editingTask` state variables
  - Updated `getCurrentView()` to return: `'empty'`, `'board'`, `'task-detail'`, `'chat'`, `'project-edit'`, `'task-edit'`
  - Added navigation functions: `navigateToBoard()`, `navigateToProjectEdit()`, `navigateToTaskEdit()`, `exitEditMode()`
  - Updated `clearSelection()` to clear edit state

- `src/components/MainContent.jsx`
  - Updated imports and context destructuring
  - Added view routing for `'board'`, `'project-edit'`, `'task-edit'` (initially with placeholders)
  - Changed `'project-detail'` routing to just `'empty'`

**Tests:** All 459 unit tests passing

---

### Phase 2: Project Cards Grid - COMPLETE

**Files Created:**
- `src/components/Dashboard/StatusBadge.jsx`
  - Clickable badge with status-specific colors (slate/amber/emerald)
  - Hover effects with scale animation
  - Configurable size (xs/sm/md)

- `src/components/Dashboard/ProjectCardGrid.jsx`
  - Grid-style project card with gradient background
  - Displays: project name, path, status badges, documentation preview (plain text)
  - Edit/Delete action buttons
  - LIVE indicator support (pulsing red dot)
  - `extractPlainText()` utility to strip markdown

**Files Modified:**
- `src/components/Dashboard/Dashboard.jsx`
  - Replaced accordion ProjectCard list with CSS Grid of ProjectCardGrid
  - Added project data fetching (task counts, documentation) for all projects
  - Added navigation handlers: `handleProjectCardClick()`, `handleStatusBadgeClick()`, `handleEditProjectClick()`
  - Updated styling with gradients and backdrop blur

- `src/components/Dashboard/index.js`
  - Added exports for `ProjectCardGrid`, `StatusBadge`

**Verified Working:**
- Dashboard displays project cards in responsive grid (1 col mobile, 2-3 cols desktop)
- Cards show: name, path, status badges with counts, documentation preview
- Clicking card navigates to board view placeholder
- Back button returns to dashboard
- Status badges are clickable
- Edit/delete buttons functional

**Tests:** All 459 unit tests passing

---

### Phase 3: Board View (Kanban) - IN PROGRESS

**Files to Create:**
- `src/components/Dashboard/BoardView.jsx` - Main board container
- `src/components/Dashboard/BoardColumn.jsx` - Single status column
- `src/components/Dashboard/BoardTaskCard.jsx` - Task card within column
- `src/components/Dashboard/EmptyColumnIllustration.jsx` - SVG for empty columns

**Status:** Not started

---

### Phase 4: Edit Pages - NOT STARTED

**Files to Create:**
- `src/components/ProjectEditPage.jsx`
- `src/components/TaskEditPage.jsx`

---

### Phase 5: Styling Polish - PARTIALLY COMPLETE

Dashboard styling has been updated in Phase 2. Board view styling pending Phase 3.

---

### Phase 6: Testing & Cleanup - NOT STARTED

---

## QA Validation Checklist

### Phase 1 Validation
- [ ] Navigate to dashboard - should show project cards grid (not accordion)
- [ ] Click a project card - should navigate to board view
- [ ] Click back button in board view - should return to dashboard
- [ ] Verify TaskDetailView is unchanged
- [ ] Verify ChatInterface is unchanged

### Phase 2 Validation
- [ ] Dashboard shows project cards in grid layout
- [ ] Cards display project name and path
- [ ] Cards display status badges with correct counts (pending=slate, in_progress=amber, completed=emerald)
- [ ] Cards display documentation preview (plain text, ~2 lines)
- [ ] Clicking status badge navigates to board view
- [ ] Edit button works (opens edit modal via App.jsx)
- [ ] Delete button works with confirmation
- [ ] LIVE indicator appears on cards with active streaming tasks
- [ ] ViewToggle switches between "By Project" and "In Progress" views
- [ ] In Progress view still works (global cross-project tasks)
- [ ] Responsive: 1 column on mobile, 2 on tablet, 3 on desktop

### Phase 3 Validation (Pending)
- [ ] Board view shows 3 columns: Pending, In Progress, Completed
- [ ] Tasks appear as cards in correct columns
- [ ] Task cards show: title, conversation count, 1-line doc, LIVE indicator
- [ ] Clicking task card opens TaskDetailView
- [ ] New Task button in header works
- [ ] Breadcrumb shows: Home > Project Name
- [ ] Desktop: all 3 columns visible, no horizontal scroll
- [ ] Mobile: horizontal scroll-snap between columns
- [ ] Mobile: partial next column visible as hint
- [ ] Empty columns show decorative illustrations

### Phase 4 Validation (Pending)
- [ ] Project edit page accessible from project card
- [ ] Task edit page accessible from task card
- [ ] Edit pages have back navigation
- [ ] Changes save correctly
- [ ] Delete with confirmation works
