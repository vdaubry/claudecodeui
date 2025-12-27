# Git Worktree Implementation Plan - Brainstorming

## Problem Statement

When multiple agents work on the same project simultaneously, they share the same working directory (`repo_folder_path`). This causes:
- File conflicts when agents edit the same files
- False test failures (one agent's incomplete refactoring breaks another's tests)
- Git state confusion (uncommitted changes mixing between tasks)
- Agent confusion when the codebase changes unexpectedly

## Current Architecture

```
Project (repo_folder_path: "/path/to/repo")
    ↓
Multiple Tasks (all share same repo_folder_path)
    ↓
Multiple Conversations (all use project.repo_folder_path as cwd)
    ↓
Claude SDK operates in shared directory = CONFLICTS
```

**Key code path** (`conversationAdapter.js`):
```javascript
const taskWithProject = tasksDb.getWithProject(taskId);
projectPath = taskWithProject.repo_folder_path;  // Always the same!
const sdkOptions = mapOptionsToSDK({ cwd: projectPath });
```

## Proposed Solution: Git Worktrees

Git Worktrees allow multiple working directories from a single repository:
- Each worktree is a separate checkout on a different branch
- They share the `.git` directory (object database, refs)
- Changes in one worktree don't affect others until merged
- Perfect for parallel development

```
Project (repo_folder_path: "/path/to/repo")
    ├── Main Repo (.git/)
    │
    └── Worktrees Directory (/path/to/repo-worktrees/)
        ├── task-15/ (branch: task/15-add-login)
        ├── task-16/ (branch: task/16-fix-auth)
        └── task-17/ (branch: task/17-refactor-db)
```

---

## Implementation Options

### Option 1: Per-Task Worktree (Recommended)

**When**: Create worktree when task is created
**Branch**: `task/{taskId}` or `task/{taskId}-{slug}`
**Lifecycle**: Worktree lives as long as the task

**Pros**:
- Simple mental model: Task = Branch = Worktree
- Complete isolation between tasks
- Changes persist across conversations
- Easy cleanup (delete task = delete worktree)
- Branch name is predictable

**Cons**:
- Disk space for many concurrent tasks
- Branch proliferation if tasks aren't cleaned up

### Option 2: On-Demand Worktree

**When**: Create only when conversation starts AND another task is active
**Lifecycle**: Created on-demand, potentially shared across conversations

**Pros**:
- Fewer worktrees created
- Saves disk space for sequential workflows

**Cons**:
- More complex detection logic
- Race conditions possible
- Less predictable behavior

### Option 3: Per-Conversation Worktree

**When**: Create when streaming starts, cleanup when done
**Lifecycle**: Ephemeral, only during conversation

**Pros**:
- Minimal disk usage
- No long-term branch management

**Cons**:
- Loses context between conversations
- Complex cleanup on crash/abort
- Expensive if conversations are frequent

**Recommendation**: Option 1 (Per-Task) - simplest, most predictable, aligns with task-driven model.

---

## Key Implementation Decisions

### 1. Worktree Location

**Option A**: Sibling directory (Recommended)
```
/path/to/repo/                    # Main repo
/path/to/repo-worktrees/          # Worktrees folder
/path/to/repo-worktrees/task-15/  # Task 15's worktree
```

**Option B**: Inside repo (Not recommended)
```
/path/to/repo/.worktrees/task-15/  # Would pollute repo
```

**Option C**: User-configurable global location
```
~/.claude-worktrees/project-name/task-15/
```

**Decision**: Option A - keeps worktrees near the repo, predictable naming, easy discovery.

### 2. Branch Naming Strategy

```
task/{taskId}                     # Simple: task/15
task/{taskId}-{slug}              # Descriptive: task/15-add-user-auth
feature/task-{taskId}             # More formal
```

**Decision**: `task/{taskId}-{slug}` where slug is derived from sanitized title (max 30 chars).

### 3. Base Branch Selection

Options:
- Always branch from `main` or `master`
- Branch from current HEAD
- User-selectable base branch per task

**Decision**: Detect default branch (`git symbolic-ref refs/remotes/origin/HEAD`), allow override in future.

### 4. Documentation Files (`.claude-ui/`)

**Current behavior**:
- `.claude-ui/` folder exists in repo root
- Contains `project.md`, `tasks/task-{id}.md`, `agents/`

**Worktree consideration**:
- Each worktree gets its own copy of all files
- Changes in worktree's `.claude-ui/` stay in that branch
- This is GOOD - task docs evolve with the task

**Concern**: Is `.claude-ui/` in `.gitignore`?
- If YES: Each worktree needs `.claude-ui/` recreated
- If NO: All worktrees have same initial state, diverge from there

**Recommendation**: Keep `.claude-ui/` tracked in git. Each task's docs evolve independently.

### 5. Task Lifecycle with Worktrees

```
CREATE TASK
    ↓
Check if project is git repo
    ↓ (yes)                      ↓ (no)
Create worktree              Skip worktree
Create branch                Use repo_folder_path
Store worktree_path
    ↓
CONVERSATION STARTS
    ↓
Use worktree_path as cwd (or fallback to repo_folder_path)
    ↓
TASK COMPLETED
    ↓
Keep worktree for merging/reference
    ↓
TASK DELETED (or explicit cleanup)
    ↓
Remove worktree
Optionally delete branch
```

---

## Database Schema Changes

**NO database changes needed!** All worktree information is derivable from conventions:

```
Worktree path: {repo_folder_path}-worktrees/task-{taskId}/
Branch name:   git branch --show-current (run in worktree directory)
```

**Deterministic logic** (on task creation):
- If git repo + checkbox ON → create worktree, **fail task creation if worktree fails**
- If git repo + checkbox OFF → skip worktree (intentional)
- If non-git repo → hide checkbox, no worktree

**Runtime logic**:
- Directory exists → use worktree path as cwd
- Directory doesn't exist → use `repo_folder_path` as cwd

**Edge case**: If worktree directory is manually deleted (outside app), fallback to main repo path. Optionally show warning in UI.

This keeps the implementation simple, fully deterministic, and avoids database changes.

---

## New Service: `server/services/worktree.js`

```javascript
// Convention-based path helpers
getWorktreePath(repoPath, taskId)     // Derive path: {repoPath}-worktrees/task-{taskId}
worktreeExists(repoPath, taskId)      // Check if worktree directory exists

// Git utilities
isGitRepository(path)                 // Check if path is a git repo
getDefaultBranch(repoPath)            // Get main/master branch name
getBranchName(worktreePath)           // Get current branch from worktree

// Worktree lifecycle
createWorktree(repoPath, taskId, title)   // Create worktree with new branch
removeWorktree(repoPath, taskId)          // Remove worktree and delete branch
getWorktreeStatus(repoPath, taskId)       // Get commits ahead/behind main

// Sync & merge workflow
syncWithMain(repoPath, taskId)            // Merge main into worktree branch
createPullRequest(repoPath, taskId, title, body)  // Push branch + gh pr create
getPullRequestStatus(repoPath, taskId)    // Check if PR exists and its state
mergeAndCleanup(repoPath, taskId)         // Full flow: merge PR, delete worktree/branch, pull main
```

---

## Code Changes Required

### Backend

| File | Changes |
|------|---------|
| `server/services/worktree.js` | **NEW** - All git worktree operations (convention-based) |
| `server/routes/tasks.js` | Integrate worktree lifecycle, add new endpoints for sync/PR/merge |
| `server/services/conversationAdapter.js` | Check worktree exists, use worktree path as cwd |

### Frontend

| File | Changes |
|------|---------|
| `BoardTaskCard.jsx` | Show branch badge |
| `TaskDetailView.jsx` | Worktree status section with Sync/PR/Merge buttons |
| Task creation modal | "Create isolated worktree" checkbox |
| `src/utils/api.js` | Add worktree API methods |

---

## Pitfalls & Mitigations (Simplified)

### Non-Git Projects

**Risk**: Project path isn't a git repository
**Mitigation**:
- Detect and gracefully skip worktree creation
- Show indicator in UI (Git vs non-Git project)
- Continue working in shared directory (legacy mode)

### Stale Worktrees

**Risk**: Main branch moves ahead, worktrees fall behind
**Mitigation**:
- "Sync with main" button per task
- Show commits behind/ahead indicator

### Merge Workflow

**Approach**: Always use PRs for merging, with full cleanup flow:
1. User clicks "Create PR" → `gh pr create`
2. User reviews/resolves conflicts in GitHub
3. User clicks "Merge & Cleanup" → `gh pr merge`, `git checkout main`, `git pull`, delete branch, delete worktree

*Note: Disk space, branch proliferation, submodules, permissions, concurrent ops, and orphaned worktrees are out of scope for V0. Manual cleanup via git CLI when needed.*

---

## UX Considerations

### Task Cards
- Show branch name as badge
- Visual indicator for worktree health
- "Commits ahead/behind" for active worktrees

### Task Detail View
- Worktree status section (branch name, worktree path)
- "Sync with main" action
- "Create PR" button → opens PR in GitHub
- "Merge & Cleanup" button → merges PR, pulls main, deletes branch, deletes worktree

### New Task Modal
- Checkbox: "Create isolated worktree" (default: true)

*No project-level settings - worktree creation is controlled per-task via the checkbox.*

---

## Design Decisions (Confirmed)

1. **Automatic but can disable**: Worktrees created automatically for all tasks by default, with a toggle in task creation to skip worktree if needed.

2. **Keep worktree on complete**: When task status → completed, preserve worktree for reference. Manual cleanup available.

3. **Create PR button**: Use GitHub CLI (`gh`) for PR creation. GH CLI is installed and configured on the system.

4. **Silently skip for non-git**: No worktree for non-git projects, no warning - transparent fallback to current behavior.

5. **Existing tasks**: Leave as-is - fallback mechanism works, no migration needed.

---

## Implementation Phases

### Phase 1: Core Infrastructure (MVP)
- [ ] `server/services/worktree.js` service (convention-based, no DB):
  - `isGitRepository(path)` - detect git repos
  - `getWorktreePath(repoPath, taskId)` - derive path from convention
  - `worktreeExists(repoPath, taskId)` - check if worktree directory exists
  - `getDefaultBranch(repoPath)` - find main/master
  - `createWorktree(repoPath, taskId, title)` - create worktree + branch
  - `removeWorktree(repoPath, taskId)` - cleanup worktree + branch
  - `getBranchName(worktreePath)` - get current branch via git
  - `getWorktreeStatus(repoPath, taskId)` - commits ahead/behind main
- [ ] Modify `server/routes/tasks.js`:
  - On POST (create): call `createWorktree()` if git repo and not skipped
  - On DELETE: call `removeWorktree()` if worktree exists
- [ ] Modify `server/services/conversationAdapter.js`:
  - Derive worktree path, check if exists, use as cwd or fallback
- [ ] API: Add `skip_worktree` option to task creation

### Phase 2: UI - Task Creation & Display
- [ ] Task creation modal: "Create isolated worktree" toggle (default: ON)
- [ ] `BoardTaskCard.jsx`: Show branch name badge (e.g., "task/15-login")
- [ ] `TaskDetailView.jsx`: Worktree info section showing:
  - Branch name
  - Commits ahead/behind main
  - Worktree path (copy button)

### Phase 3: PR & Merge Workflow (GitHub CLI)
- [ ] `server/services/worktree.js` additions:
  - `createPullRequest(worktreePath, title, body)` - `gh pr create`
  - `getPullRequestStatus(worktreePath)` - check if PR exists and its state
  - `mergePullRequest(worktreePath)` - `gh pr merge`
  - `syncWithMain(worktreePath, mainBranch)` - `git fetch && git merge main`
  - `fullCleanup(repoPath, taskId)` - merge PR, checkout main, pull, delete branch, delete worktree
- [ ] API endpoints:
  - `POST /api/tasks/:taskId/pull-request` - create PR
  - `POST /api/tasks/:taskId/sync` - sync with main
  - `POST /api/tasks/:taskId/merge-cleanup` - full merge & cleanup flow
- [ ] `TaskDetailView.jsx`:
  - "Sync with main" button
  - "Create PR" button (disabled if no commits ahead)
  - "Merge & Cleanup" button (visible when PR exists and is mergeable)

---

## Detailed Implementation Plan

### 1. New Worktree Service (`server/services/worktree.js`)

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// Convention-based path derivation
export function getWorktreePath(repoPath, taskId) {
  return path.join(`${repoPath}-worktrees`, `task-${taskId}`);
}

// Check if worktree exists
export async function worktreeExists(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    await fs.promises.access(worktreePath);
    return true;
  } catch {
    return false;
  }
}

// Check if path is a git repository
export async function isGitRepository(repoPath) {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

// Get default branch (main or master)
export async function getDefaultBranch(repoPath) {
  try {
    const { stdout } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD',
      { cwd: repoPath }
    );
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    return 'main';
  }
}

// Get current branch name from worktree
export async function getBranchName(worktreePath) {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: worktreePath });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Create worktree for a task
export async function createWorktree(repoPath, taskId, title) {
  const sanitizedTitle = (title || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  const branch = `task/${taskId}-${sanitizedTitle}`;
  const worktreesDir = `${repoPath}-worktrees`;
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    await fs.promises.mkdir(worktreesDir, { recursive: true });
    const baseBranch = await getDefaultBranch(repoPath);
    await execAsync(
      `git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`,
      { cwd: repoPath }
    );
    return { success: true, worktreePath, branch };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Remove worktree and branch
export async function removeWorktree(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    const branch = await getBranchName(worktreePath);
    await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });
    if (branch) {
      await execAsync(`git branch -D "${branch}"`, { cwd: repoPath });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get worktree status (commits ahead/behind main)
export async function getWorktreeStatus(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    const branch = await getBranchName(worktreePath);
    const mainBranch = await getDefaultBranch(repoPath);

    await execAsync('git fetch origin', { cwd: worktreePath });
    const { stdout } = await execAsync(
      `git rev-list --left-right --count origin/${mainBranch}...HEAD`,
      { cwd: worktreePath }
    );
    const [behind, ahead] = stdout.trim().split('\t').map(Number);

    return { success: true, branch, ahead, behind, mainBranch };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sync worktree with main branch
export async function syncWithMain(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    const mainBranch = await getDefaultBranch(repoPath);
    await execAsync('git fetch origin', { cwd: worktreePath });
    await execAsync(`git merge origin/${mainBranch}`, { cwd: worktreePath });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create PR using gh CLI
export async function createPullRequest(repoPath, taskId, title, body) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    // First push the branch
    const branch = await getBranchName(worktreePath);
    await execAsync(`git push -u origin "${branch}"`, { cwd: worktreePath });

    const { stdout } = await execAsync(
      `gh pr create --title "${title}" --body "${body}"`,
      { cwd: worktreePath }
    );
    return { success: true, url: stdout.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get PR status
export async function getPullRequestStatus(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    const { stdout } = await execAsync('gh pr view --json url,state,mergeable', { cwd: worktreePath });
    return { success: true, ...JSON.parse(stdout) };
  } catch {
    return { success: false, exists: false };
  }
}

// Full merge and cleanup flow
export async function mergeAndCleanup(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    // 1. Merge the PR
    await execAsync('gh pr merge --merge', { cwd: worktreePath });

    // 2. Get branch name before removing worktree
    const branch = await getBranchName(worktreePath);

    // 3. Remove worktree
    await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });

    // 4. Delete local branch
    if (branch) {
      await execAsync(`git branch -D "${branch}"`, { cwd: repoPath });
    }

    // 5. Pull main in the main repo
    const mainBranch = await getDefaultBranch(repoPath);
    await execAsync(`git checkout ${mainBranch}`, { cwd: repoPath });
    await execAsync('git pull', { cwd: repoPath });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### 2. Task Routes (`server/routes/tasks.js`)

**Modify POST handler** (line ~71):
```javascript
import { isGitRepository, createWorktree } from '../services/worktree.js';

// In POST /projects/:projectId/tasks
router.post('/projects/:projectId/tasks', async (req, res) => {
  const { title, skip_worktree } = req.body;

  // Check if git repo (to know if worktree option applies)
  const isGit = await isGitRepository(project.repo_folder_path);

  // If git repo and worktree requested, create worktree FIRST
  // Fail fast if worktree creation fails
  if (isGit && !skip_worktree) {
    // We need task ID, so create task first in a transaction-like manner
    const task = tasksDb.create(projectId, title?.trim() || null);

    const result = await createWorktree(project.repo_folder_path, task.id, title);
    if (!result.success) {
      // Rollback: delete the task we just created
      tasksDb.delete(task.id);
      return res.status(500).json({ error: `Failed to create worktree: ${result.error}` });
    }

    return res.status(201).json(task);
  }

  // No worktree needed (non-git or skipped)
  const task = tasksDb.create(projectId, title?.trim() || null);
  return res.status(201).json(task);
});
```

**Key point**: If worktree creation fails, the entire task creation fails. This ensures deterministic state.

**Modify DELETE handler**:
```javascript
import { worktreeExists, removeWorktree } from '../services/worktree.js';

// In DELETE /tasks/:id
if (await worktreeExists(project.repo_folder_path, task.id)) {
  await removeWorktree(project.repo_folder_path, task.id);
}
```

**Add new endpoints**:
```javascript
import {
  getWorktreeStatus, syncWithMain, createPullRequest,
  getPullRequestStatus, mergeAndCleanup
} from '../services/worktree.js';

// GET /tasks/:id/worktree - Get worktree status
router.get('/tasks/:id/worktree', async (req, res) => {
  const task = tasksDb.getWithProject(req.params.id);
  const status = await getWorktreeStatus(task.repo_folder_path, task.id);
  res.json(status);
});

// POST /tasks/:id/sync - Sync with main
router.post('/tasks/:id/sync', async (req, res) => {
  const task = tasksDb.getWithProject(req.params.id);
  const result = await syncWithMain(task.repo_folder_path, task.id);
  res.json(result);
});

// POST /tasks/:id/pull-request - Create PR
router.post('/tasks/:id/pull-request', async (req, res) => {
  const task = tasksDb.getWithProject(req.params.id);
  const { title, body } = req.body;
  const result = await createPullRequest(task.repo_folder_path, task.id, title, body);
  res.json(result);
});

// GET /tasks/:id/pull-request - Get PR status
router.get('/tasks/:id/pull-request', async (req, res) => {
  const task = tasksDb.getWithProject(req.params.id);
  const status = await getPullRequestStatus(task.repo_folder_path, task.id);
  res.json(status);
});

// POST /tasks/:id/merge-cleanup - Merge PR and cleanup
router.post('/tasks/:id/merge-cleanup', async (req, res) => {
  const task = tasksDb.getWithProject(req.params.id);
  const result = await mergeAndCleanup(task.repo_folder_path, task.id);
  res.json(result);
});
```

### 3. Conversation Adapter (`server/services/conversationAdapter.js`)

**Modify cwd selection**:
```javascript
import { getWorktreePath, worktreeExists } from './worktree.js';

// In sendMessage() and startConversation():
const taskWithProject = tasksDb.getWithProject(taskId);
let projectPath = taskWithProject.repo_folder_path;

// Check if worktree exists and use it
if (await worktreeExists(taskWithProject.repo_folder_path, taskId)) {
  projectPath = getWorktreePath(taskWithProject.repo_folder_path, taskId);
}
```

### 4. Frontend - Task Creation

**Add API to check if project is git repo** (`src/utils/api.js`):
```javascript
projects: {
  // existing methods...
  isGitRepo: (projectId) => fetchJSON(`/api/projects/${projectId}/is-git-repo`),
}
```

**Add backend endpoint** (`server/routes/projects.js`):
```javascript
router.get('/projects/:id/is-git-repo', async (req, res) => {
  const project = projectsDb.getById(req.params.id);
  const isGit = await isGitRepository(project.repo_folder_path);
  res.json({ isGitRepo: isGit });
});
```

**Modify task creation modal**:
```jsx
const [createWorktree, setCreateWorktree] = useState(true);
const [isGitRepo, setIsGitRepo] = useState(false);

useEffect(() => {
  api.projects.isGitRepo(projectId).then(({ isGitRepo }) => setIsGitRepo(isGitRepo));
}, [projectId]);

// In form (only show checkbox for git repos):
{isGitRepo && (
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={createWorktree}
      onChange={(e) => setCreateWorktree(e.target.checked)}
    />
    <span>Create isolated worktree</span>
  </label>
)}

// API call (only send skip_worktree for git repos):
await api.tasks.create(projectId, {
  title,
  ...(isGitRepo && { skip_worktree: !createWorktree })
});
```

**Handle error gracefully**:
```jsx
const handleSubmit = async () => {
  try {
    await api.tasks.create(projectId, { title, skip_worktree: !createWorktree });
    onSuccess();
  } catch (error) {
    // Show error if worktree creation failed
    setError(error.message || 'Failed to create task');
  }
};
```

### 5. Frontend - Task Display

**New API methods** (`src/utils/api.js`):
```javascript
tasks: {
  // existing methods...
  getWorktreeStatus: (taskId) => fetchJSON(`/api/tasks/${taskId}/worktree`),
  syncWithMain: (taskId) => fetchJSON(`/api/tasks/${taskId}/sync`, { method: 'POST' }),
  createPR: (taskId, title, body) => fetchJSON(`/api/tasks/${taskId}/pull-request`, {
    method: 'POST', body: JSON.stringify({ title, body })
  }),
  getPRStatus: (taskId) => fetchJSON(`/api/tasks/${taskId}/pull-request`),
  mergeAndCleanup: (taskId) => fetchJSON(`/api/tasks/${taskId}/merge-cleanup`, { method: 'POST' }),
}
```

**TaskDetailView.jsx** - Worktree section:
```jsx
const [worktreeStatus, setWorktreeStatus] = useState(null);
const [prStatus, setPrStatus] = useState(null);

useEffect(() => {
  loadWorktreeStatus();
}, [task.id]);

const loadWorktreeStatus = async () => {
  const status = await api.tasks.getWorktreeStatus(task.id);
  setWorktreeStatus(status);
  if (status.success) {
    const pr = await api.tasks.getPRStatus(task.id);
    setPrStatus(pr);
  }
};

// In render:
{worktreeStatus?.success && (
  <div className="worktree-section">
    <h4>Branch: {worktreeStatus.branch}</h4>
    <p>{worktreeStatus.ahead} ahead, {worktreeStatus.behind} behind {worktreeStatus.mainBranch}</p>

    <div className="worktree-actions">
      <button onClick={handleSyncWithMain}>Sync with {worktreeStatus.mainBranch}</button>

      {!prStatus?.exists ? (
        <button onClick={handleCreatePR} disabled={worktreeStatus.ahead === 0}>
          Create PR
        </button>
      ) : (
        <>
          <a href={prStatus.url} target="_blank">View PR</a>
          {prStatus.mergeable && (
            <button onClick={handleMergeAndCleanup}>Merge & Cleanup</button>
          )}
        </>
      )}
    </div>
  </div>
)}
```

---

## Files to Modify

| File | Purpose |
|------|---------|
| `server/services/worktree.js` | **NEW** - All git worktree operations (convention-based, no DB) |
| `server/routes/tasks.js` | Integrate worktree lifecycle, add sync/PR/merge endpoints |
| `server/routes/projects.js` | Add `is-git-repo` endpoint |
| `server/services/conversationAdapter.js` | Use worktree path as cwd when exists |
| `src/components/Dashboard/BoardTaskCard.jsx` | Branch badge display |
| `src/components/TaskDetailView.jsx` | Worktree info section with actions |
| Task creation modal component | Conditional worktree checkbox (git repos only) |
| `src/utils/api.js` | Add worktree-related API methods |

---

## Summary

Git Worktrees are the right solution for isolating concurrent agent work. The **per-task worktree model** provides:

- Complete isolation between tasks
- Simple mental model: Task = Branch = Worktree
- Convention-based paths (no database changes)
- Graceful fallback for non-git or failed cases

**Key implementation principles:**
1. **Convention over configuration**: Paths derived from `{repo}-worktrees/task-{id}/`
2. **Automatic but can disable**: Worktrees created by default, with opt-out checkbox
3. **Graceful degradation**: Silently fall back to shared directory for non-git projects
4. **PR-based merge workflow**: Create PR → Resolve conflicts in GitHub → Merge & Cleanup
5. **Full cleanup flow**: `gh pr merge` → delete worktree → delete branch → pull main
6. **Observable**: Branch name, commits ahead/behind shown in UI
