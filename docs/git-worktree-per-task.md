# Git Worktree Support Implementation Plan

## Overview

Add Git worktree support to Claude Code UI, enabling isolated workspaces for each task. Each task automatically gets its own worktree branched from main, with ability to switch worktrees and test projects via a "Test" button.

## Architecture

```
/home/user/project/                     <- Main repo (main branch)
/home/user/project-worktrees/           <- Worktrees folder
    task-15-add-login/                  <- Worktree for task 15
    task-16-fix-bug/                    <- Worktree for task 16
/home/user/project-current              <- Symlink to active worktree
```

**Server restart**: Uses `.claude-ui/bin/stop-server.sh` and `.claude-ui/bin/start-server.sh` scripts in each project.

---

## Files to Modify

### Backend

| File | Changes |
|------|---------|
| `server/database/db.js` | Add migrations for `worktree_path`, `worktree_branch` (tasks), `test_url` (projects) |
| `server/services/worktree.js` | **NEW** - Git worktree operations service |
| `server/routes/tasks.js` | Update task create/delete, add `/test` endpoint |
| `server/routes/projects.js` | Handle `test_url` field |
| `server/index.js` | Use `worktree_path` as cwd for Claude conversations |

### Frontend

| File | Changes |
|------|---------|
| `src/utils/api.js` | Add `tasks.test()` API method |
| `src/contexts/TaskContext.jsx` | Add `testTask()` method and state |
| `src/components/TaskDetailView.jsx` | Add Test button, worktree info badge |
| `src/App.jsx` | Add `test_url` field to project form |

---

## Implementation Steps

### Step 1: Database Migrations

**File: `server/database/db.js`**

Add to `runMigrations()`:

```javascript
// Worktree columns for tasks
if (!taskColumnNames.includes('worktree_path')) {
  console.log('Running migration: Adding worktree columns to tasks');
  db.exec('ALTER TABLE tasks ADD COLUMN worktree_path TEXT');
  db.exec('ALTER TABLE tasks ADD COLUMN worktree_branch TEXT');
}

// Test URL for projects
const projectTableInfo = db.prepare("PRAGMA table_info(projects)").all();
const projectColumnNames = projectTableInfo.map(col => col.name);
if (!projectColumnNames.includes('test_url')) {
  console.log('Running migration: Adding test_url to projects');
  db.exec('ALTER TABLE projects ADD COLUMN test_url TEXT');
}
```

Add to `tasksDb`:

```javascript
updateWorktree: (id, worktreePath, worktreeBranch) => {
  const stmt = db.prepare(
    'UPDATE tasks SET worktree_path = ?, worktree_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  stmt.run(worktreePath, worktreeBranch, id);
  return tasksDb.getById(id);
}
```

---

### Step 2: Worktree Service

**File: `server/services/worktree.js` (NEW)**

```javascript
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Generate branch name: task-15-add-user-auth
export function generateBranchName(taskId, title = '') {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  return slug ? `task-${taskId}-${slug}` : `task-${taskId}`;
}

// Generate worktree path: /repo-worktrees/task-15-add-user-auth/
export function generateWorktreePath(repoPath, taskId, title = '') {
  const repoName = path.basename(repoPath);
  const parentDir = path.dirname(repoPath);
  const branchName = generateBranchName(taskId, title);
  return path.join(parentDir, `${repoName}-worktrees`, branchName);
}

// Get symlink path: /repo-current
export function getCurrentSymlinkPath(repoPath) {
  const repoName = path.basename(repoPath);
  return path.join(path.dirname(repoPath), `${repoName}-current`);
}

// Create worktree from main
export async function createWorktree(repoPath, taskId, title = '') {
  const branch = generateBranchName(taskId, title);
  const worktreePath = generateWorktreePath(repoPath, taskId, title);

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await execAsync('git fetch origin main', { cwd: repoPath });
  await execAsync(
    `git worktree add -b "${branch}" "${worktreePath}" origin/main`,
    { cwd: repoPath }
  );

  return { success: true, worktreePath, branch };
}

// Remove worktree and branch
export async function removeWorktree(repoPath, worktreePath, branch) {
  await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });
  await execAsync(`git branch -D "${branch}"`, { cwd: repoPath }).catch(() => {});
  return { success: true };
}

// Switch symlink to target
export async function switchCurrentSymlink(repoPath, targetPath) {
  const symlinkPath = getCurrentSymlinkPath(repoPath);
  await fs.unlink(symlinkPath).catch(() => {});
  await fs.symlink(targetPath, symlinkPath, 'dir');
  return { success: true };
}

// Execute server restart scripts
export async function restartServer(worktreePath) {
  const binDir = path.join(worktreePath, '.claude-ui', 'bin');
  const stopScript = path.join(binDir, 'stop-server.sh');
  const startScript = path.join(binDir, 'start-server.sh');

  await execAsync(`bash "${stopScript}"`, { cwd: worktreePath });
  exec(`bash "${startScript}"`, { cwd: worktreePath, detached: true });

  return { success: true };
}
```

---

### Step 3: Tasks Routes

**File: `server/routes/tasks.js`**

Update `POST /api/projects/:projectId/tasks`:
- After creating task, call `createWorktree()`
- Store `worktree_path` and `worktree_branch` in task record

Update `DELETE /api/tasks/:id`:
- Call `removeWorktree()` before deleting from database

Add new endpoint `POST /api/tasks/:id/test`:
```javascript
router.post('/tasks/:id/test', async (req, res) => {
  // 1. Get task with project info
  // 2. Switch symlink to task's worktree
  // 3. Run stop-server.sh then start-server.sh
  // 4. Return { success, testUrl, serverRestarted }
});
```

---

### Step 4: Update WebSocket Handler

**File: `server/index.js`**

In WebSocket `claude-command` handler, use worktree path as cwd:

```javascript
// Around line 408, when starting new conversation:
const workingDir = taskWithProject.worktree_path || taskWithProject.repo_folder_path;
sdkOptions.cwd = workingDir;

// Around line 439, when resuming conversation:
sdkOptions.cwd = taskWithProject.worktree_path || taskWithProject.repo_folder_path;
```

---

### Step 5: Frontend API

**File: `src/utils/api.js`**

```javascript
tasks: {
  // ... existing methods ...
  test: (id) => authenticatedFetch(`/api/tasks/${id}/test`, { method: 'POST' }),
}

projects: {
  // Update to include testUrl in body
}
```

---

### Step 6: TaskContext

**File: `src/contexts/TaskContext.jsx`**

```javascript
const [isTestingTask, setIsTestingTask] = useState(false);

const testTask = useCallback(async (taskId) => {
  setIsTestingTask(true);
  try {
    const response = await api.tasks.test(taskId);
    const data = await response.json();
    if (data.testUrl) {
      window.open(data.testUrl, '_blank');
    }
    return data;
  } finally {
    setIsTestingTask(false);
  }
}, []);
```

---

### Step 7: TaskDetailView

**File: `src/components/TaskDetailView.jsx`**

Add props: `onTestTask`, `isTestingTask`, `testUrl`

Add Test button next to status selector:

```jsx
<button
  onClick={() => onTestTask(task.id)}
  disabled={isTestingTask || !task.worktree_path}
  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
             bg-green-500/10 text-green-600 hover:bg-green-500/20"
>
  {isTestingTask ? 'Testing...' : 'Test'}
  <ExternalLink className="w-3 h-3" />
</button>
```

Add worktree branch badge below title:

```jsx
{task.worktree_branch && (
  <span className="px-2 py-0.5 bg-muted rounded font-mono text-xs">
    {task.worktree_branch}
  </span>
)}
```

---

### Step 8: Project Form

**File: `src/App.jsx`** (or wherever project form is)

Add test_url input field:

```jsx
<Input
  type="url"
  value={testUrl}
  onChange={(e) => setTestUrl(e.target.value)}
  placeholder="http://localhost:3000"
  label="Test URL"
/>
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Git fetch fails | Log error, create task without worktree |
| Branch already exists | Append timestamp suffix |
| Scripts not found | Show warning, still switch worktree |
| Symlink creation fails | Return error to user |

---

## Testing Checklist

1. [ ] Create task - worktree is created automatically
2. [ ] Delete task - worktree is removed
3. [ ] Start conversation - Claude uses worktree as cwd
4. [ ] Click Test button - symlink switches, server restarts, URL opens
5. [ ] Project form - test_url saves and loads correctly
