import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * Derive the worktree path for a task based on convention
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {string} - Path to the worktree directory
 */
export function getWorktreePath(repoPath, taskId) {
  return path.join(`${repoPath}-worktrees`, `task-${taskId}`);
}

/**
 * Get the worktrees directory for a repository
 * @param {string} repoPath - Absolute path to the main repository
 * @returns {string} - Path to the worktrees directory
 */
export function getWorktreesDir(repoPath) {
  return `${repoPath}-worktrees`;
}

/**
 * Check if a worktree exists for a task
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<boolean>} - True if worktree directory exists
 */
export async function worktreeExists(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);
  try {
    await fs.promises.access(worktreePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a git repository
 * @param {string} repoPath - Path to check
 * @returns {Promise<boolean>} - True if path is a git repository
 */
export async function isGitRepository(repoPath) {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default branch name (main or master)
 * @param {string} repoPath - Absolute path to the repository
 * @returns {Promise<string>} - Default branch name
 */
export async function getDefaultBranch(repoPath) {
  try {
    // Try to get the default branch from origin
    const { stdout } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD',
      { cwd: repoPath }
    );
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    return 'main'; // Fallback to main
  }
}

/**
 * Get the current branch name from a worktree
 * @param {string} worktreePath - Path to the worktree
 * @returns {Promise<string|null>} - Branch name or null if not found
 */
export async function getBranchName(worktreePath) {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: worktreePath });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Sanitize a title for use in branch names
 * @param {string} title - Original title
 * @returns {string} - Sanitized slug
 */
function sanitizeTitle(title) {
  return (title || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    .slice(0, 30);
}

/**
 * Create a worktree for a task
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @param {string} title - Task title (used for branch naming)
 * @returns {Promise<{success: boolean, worktreePath?: string, branch?: string, error?: string}>}
 */
export async function createWorktree(repoPath, taskId, title) {
  const sanitizedTitle = sanitizeTitle(title);
  const branch = `task/${taskId}-${sanitizedTitle}`;
  const worktreesDir = getWorktreesDir(repoPath);
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    // Ensure worktrees directory exists
    await fs.promises.mkdir(worktreesDir, { recursive: true });

    // Get default branch to branch from
    const baseBranch = await getDefaultBranch(repoPath);

    // Create worktree with new branch
    await execAsync(
      `git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`,
      { cwd: repoPath }
    );

    return { success: true, worktreePath, branch };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove a worktree and its branch
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function removeWorktree(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    // Get branch name before removing worktree
    const branch = await getBranchName(worktreePath);

    // Remove the worktree
    await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });

    // Delete the branch if we found one
    if (branch) {
      try {
        await execAsync(`git branch -D "${branch}"`, { cwd: repoPath });
      } catch {
        // Branch might already be deleted or not exist, ignore
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get worktree status including commits ahead/behind main
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<{success: boolean, branch?: string, ahead?: number, behind?: number, mainBranch?: string, worktreePath?: string, error?: string}>}
 */
export async function getWorktreeStatus(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    // Check if worktree exists
    await fs.promises.access(worktreePath);

    const branch = await getBranchName(worktreePath);
    const mainBranch = await getDefaultBranch(repoPath);

    // Fetch latest from origin
    try {
      await execAsync('git fetch origin', { cwd: worktreePath });
    } catch {
      // Fetch might fail if offline, continue anyway
    }

    // Get commits ahead/behind
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout } = await execAsync(
        `git rev-list --left-right --count origin/${mainBranch}...HEAD`,
        { cwd: worktreePath }
      );
      const parts = stdout.trim().split(/\s+/);
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    } catch {
      // Might fail if origin/main doesn't exist
    }

    return {
      success: true,
      branch,
      ahead,
      behind,
      mainBranch,
      worktreePath
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sync a worktree with the main branch (merge main into worktree branch)
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncWithMain(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    const mainBranch = await getDefaultBranch(repoPath);

    // Fetch latest
    await execAsync('git fetch origin', { cwd: worktreePath });

    // Merge main into current branch
    await execAsync(`git merge origin/${mainBranch}`, { cwd: worktreePath });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create a pull request for a task's worktree branch
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @param {string} title - PR title
 * @param {string} body - PR body/description
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function createPullRequest(repoPath, taskId, title, body) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    // Get the branch name
    const branch = await getBranchName(worktreePath);

    // Push the branch to origin
    await execAsync(`git push -u origin "${branch}"`, { cwd: worktreePath });

    // Escape quotes in title and body for shell
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');

    // Create PR using gh CLI
    const { stdout } = await execAsync(
      `gh pr create --title "${escapedTitle}" --body "${escapedBody}"`,
      { cwd: worktreePath }
    );

    return { success: true, url: stdout.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get the status of a pull request for a task's worktree branch
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<{success: boolean, exists: boolean, url?: string, state?: string, mergeable?: string, error?: string}>}
 */
export async function getPullRequestStatus(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    const { stdout } = await execAsync(
      'gh pr view --json url,state,mergeable',
      { cwd: worktreePath }
    );
    const prData = JSON.parse(stdout);
    return {
      success: true,
      exists: true,
      url: prData.url,
      state: prData.state,
      mergeable: prData.mergeable
    };
  } catch {
    // No PR exists for this branch
    return { success: true, exists: false };
  }
}

/**
 * Merge a pull request and clean up the worktree and branch
 * This performs the full cleanup flow:
 * 1. Merge the PR
 * 2. Remove the worktree
 * 3. Delete the local branch
 * 4. Checkout main and pull latest
 *
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function mergeAndCleanup(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    // Get branch name before any changes
    const branch = await getBranchName(worktreePath);
    const mainBranch = await getDefaultBranch(repoPath);

    // 1. Merge the PR using gh CLI
    await execAsync('gh pr merge --merge', { cwd: worktreePath });

    // 2. Remove the worktree
    await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });

    // 3. Delete the local branch
    if (branch) {
      try {
        await execAsync(`git branch -D "${branch}"`, { cwd: repoPath });
      } catch {
        // Branch might not exist locally, ignore
      }
    }

    // 4. Checkout main and pull latest
    await execAsync(`git checkout ${mainBranch}`, { cwd: repoPath });
    await execAsync('git pull', { cwd: repoPath });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if there are uncommitted changes in a worktree
 * @param {string} repoPath - Absolute path to the main repository
 * @param {number} taskId - The task ID
 * @returns {Promise<{success: boolean, hasChanges?: boolean, error?: string}>}
 */
export async function hasUncommittedChanges(repoPath, taskId) {
  const worktreePath = getWorktreePath(repoPath, taskId);

  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: worktreePath });
    return { success: true, hasChanges: stdout.trim().length > 0 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
