import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to create mock functions that can be used in vi.mock
const { mockExec, mockAccess, mockMkdir } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockAccess: vi.fn(),
  mockMkdir: vi.fn()
}));

// Mock child_process - need to include default for ESM/CJS interop
vi.mock('child_process', () => ({
  default: { exec: mockExec },
  exec: mockExec
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    promises: {
      access: mockAccess,
      mkdir: mockMkdir
    }
  },
  promises: {
    access: mockAccess,
    mkdir: mockMkdir
  }
}));

// Mock util.promisify to convert our callback-style mock to promise-style
vi.mock('util', () => ({
  default: {
    promisify: (fn) => {
      return (...args) => {
        return new Promise((resolve, reject) => {
          fn(...args, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout, stderr });
          });
        });
      };
    }
  },
  promisify: (fn) => {
    return (...args) => {
      return new Promise((resolve, reject) => {
        fn(...args, (err, stdout, stderr) => {
          if (err) reject(err);
          else resolve({ stdout, stderr });
        });
      });
    };
  }
}));

import {
  getWorktreePath,
  getWorktreesDir,
  worktreeExists,
  isGitRepository,
  getDefaultBranch,
  getBranchName,
  createWorktree,
  removeWorktree,
  getWorktreeStatus,
  syncWithMain,
  createPullRequest,
  getPullRequestStatus,
  mergeAndCleanup,
  hasUncommittedChanges
} from './worktree.js';

describe('Worktree Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorktreePath', () => {
    it('should return correct worktree path for a task', () => {
      const repoPath = '/home/user/myproject';
      const taskId = 15;

      const result = getWorktreePath(repoPath, taskId);

      expect(result).toBe('/home/user/myproject-worktrees/task-15');
    });

    it('should handle paths without trailing slash', () => {
      const result = getWorktreePath('/path/to/repo', 42);
      expect(result).toBe('/path/to/repo-worktrees/task-42');
    });
  });

  describe('getWorktreesDir', () => {
    it('should return worktrees directory path', () => {
      const result = getWorktreesDir('/home/user/myproject');
      expect(result).toBe('/home/user/myproject-worktrees');
    });
  });

  describe('worktreeExists', () => {
    it('should return true when worktree directory exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      const result = await worktreeExists('/home/user/repo', 10);

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith('/home/user/repo-worktrees/task-10');
    });

    it('should return false when worktree directory does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await worktreeExists('/home/user/repo', 10);

      expect(result).toBe(false);
    });
  });

  describe('isGitRepository', () => {
    it('should return true for valid git repository', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, '.git', '');
      });

      const result = await isGitRepository('/path/to/repo');

      expect(result).toBe(true);
    });

    it('should return false for non-git directory', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('not a git repository'), '', '');
      });

      const result = await isGitRepository('/path/to/not-repo');

      expect(result).toBe(false);
    });
  });

  describe('getDefaultBranch', () => {
    it('should return main when symbolic ref points to origin/main', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, 'refs/remotes/origin/main\n', '');
      });

      const result = await getDefaultBranch('/path/to/repo');

      expect(result).toBe('main');
    });

    it('should return master when symbolic ref points to origin/master', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, 'refs/remotes/origin/master\n', '');
      });

      const result = await getDefaultBranch('/path/to/repo');

      expect(result).toBe('master');
    });

    it('should fallback to main on error', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('failed'), '', '');
      });

      const result = await getDefaultBranch('/path/to/repo');

      expect(result).toBe('main');
    });
  });

  describe('getBranchName', () => {
    it('should return current branch name', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, 'task/15-add-feature\n', '');
      });

      const result = await getBranchName('/path/to/worktree');

      expect(result).toBe('task/15-add-feature');
    });

    it('should return null on error', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('failed'), '', '');
      });

      const result = await getBranchName('/path/to/worktree');

      expect(result).toBe(null);
    });
  });

  describe('createWorktree', () => {
    it('should create worktree successfully', async () => {
      mockMkdir.mockResolvedValue(undefined);
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          // getDefaultBranch call
          callback(null, 'main\n', '');
        } else {
          // git worktree add call
          callback(null, '', '');
        }
      });

      const result = await createWorktree('/home/user/repo', 15, 'Add User Login');

      expect(result.success).toBe(true);
      expect(result.worktreePath).toBe('/home/user/repo-worktrees/task-15');
      expect(result.branch).toBe('task/15-add-user-login');
      expect(mockMkdir).toHaveBeenCalledWith('/home/user/repo-worktrees', { recursive: true });
    });

    it('should sanitize title with special characters', async () => {
      mockMkdir.mockResolvedValue(undefined);
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          callback(null, 'main\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await createWorktree('/repo', 1, 'Fix bug #123 & add tests!!!');

      expect(result.branch).toBe('task/1-fix-bug-123-add-tests');
    });

    it('should truncate long titles to 30 characters', async () => {
      mockMkdir.mockResolvedValue(undefined);
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          callback(null, 'main\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const longTitle = 'This is a very long task title that should be truncated';
      const result = await createWorktree('/repo', 1, longTitle);

      // Branch slug should be at most 30 chars
      const slug = result.branch.replace('task/1-', '');
      expect(slug.length).toBeLessThanOrEqual(30);
    });

    it('should return error on git failure', async () => {
      mockMkdir.mockResolvedValue(undefined);
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          callback(null, 'main\n', '');
        } else {
          callback(new Error('fatal: branch already exists'), '', '');
        }
      });

      const result = await createWorktree('/repo', 1, 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('branch already exists');
    });
  });

  describe('removeWorktree', () => {
    it('should remove worktree and branch successfully', async () => {
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          // getBranchName
          callback(null, 'task/15-feature\n', '');
        } else if (callCount === 2) {
          // git worktree remove
          callback(null, '', '');
        } else {
          // git branch -D
          callback(null, '', '');
        }
      });

      const result = await removeWorktree('/repo', 15);

      expect(result.success).toBe(true);
    });

    it('should succeed even if branch deletion fails', async () => {
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          callback(null, 'task/15-feature\n', '');
        } else if (callCount === 2) {
          callback(null, '', '');
        } else {
          callback(new Error('branch not found'), '', '');
        }
      });

      const result = await removeWorktree('/repo', 15);

      expect(result.success).toBe(true);
    });

    it('should return error when worktree removal fails', async () => {
      let callCount = 0;
      mockExec.mockImplementation((cmd, opts, callback) => {
        callCount++;
        if (callCount === 1) {
          callback(null, 'task/15-feature\n', '');
        } else {
          callback(new Error('worktree not found'), '', '');
        }
      });

      const result = await removeWorktree('/repo', 15);

      expect(result.success).toBe(false);
      expect(result.error).toContain('worktree not found');
    });
  });

  describe('getWorktreeStatus', () => {
    it('should return worktree status with ahead/behind counts', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('branch --show-current')) {
          callback(null, 'task/10-feature\n', '');
        } else if (cmd.includes('symbolic-ref')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('fetch')) {
          callback(null, '', '');
        } else if (cmd.includes('rev-list')) {
          callback(null, '2\t5\n', ''); // 2 behind, 5 ahead
        } else {
          callback(null, '', '');
        }
      });

      const result = await getWorktreeStatus('/repo', 10);

      expect(result.success).toBe(true);
      expect(result.branch).toBe('task/10-feature');
      expect(result.ahead).toBe(5);
      expect(result.behind).toBe(2);
      expect(result.worktreePath).toBe('/repo-worktrees/task-10');
    });

    it('should handle worktree not existing', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await getWorktreeStatus('/repo', 99);

      expect(result.success).toBe(false);
    });
  });

  describe('syncWithMain', () => {
    it('should sync worktree with main successfully', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('symbolic-ref')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('fetch')) {
          callback(null, '', '');
        } else if (cmd.includes('merge')) {
          callback(null, '', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await syncWithMain('/repo', 10);

      expect(result.success).toBe(true);
    });

    it('should return error on merge conflict', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('symbolic-ref')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('fetch')) {
          callback(null, '', '');
        } else if (cmd.includes('merge')) {
          callback(new Error('merge conflict'), '', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await syncWithMain('/repo', 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('merge conflict');
    });
  });

  describe('createPullRequest', () => {
    it('should create PR successfully', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('branch --show-current')) {
          callback(null, 'task/10-feature\n', '');
        } else if (cmd.includes('push')) {
          callback(null, '', '');
        } else if (cmd.includes('gh pr create')) {
          callback(null, 'https://github.com/user/repo/pull/123\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await createPullRequest('/repo', 10, 'Add feature', 'Description');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://github.com/user/repo/pull/123');
    });

    it('should escape quotes in title and body', async () => {
      let capturedCmd = '';
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('gh pr create')) {
          capturedCmd = cmd;
          callback(null, 'https://github.com/user/repo/pull/1\n', '');
        } else if (cmd.includes('branch --show-current')) {
          callback(null, 'task/1-test\n', '');
        } else {
          callback(null, '', '');
        }
      });

      await createPullRequest('/repo', 1, 'Fix "bug"', 'It\'s "quoted"');

      expect(capturedCmd).toContain('\\"bug\\"');
    });

    it('should return error on gh CLI failure', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('branch --show-current')) {
          callback(null, 'task/10-feature\n', '');
        } else if (cmd.includes('push')) {
          callback(null, '', '');
        } else if (cmd.includes('gh pr create')) {
          callback(new Error('gh: not authenticated'), '', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await createPullRequest('/repo', 10, 'Title', 'Body');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not authenticated');
    });
  });

  describe('getPullRequestStatus', () => {
    it('should return PR status when PR exists', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, JSON.stringify({
          url: 'https://github.com/user/repo/pull/123',
          state: 'OPEN',
          mergeable: 'MERGEABLE'
        }), '');
      });

      const result = await getPullRequestStatus('/repo', 10);

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.url).toBe('https://github.com/user/repo/pull/123');
      expect(result.state).toBe('OPEN');
      expect(result.mergeable).toBe('MERGEABLE');
    });

    it('should return exists:false when no PR', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('no pull request found'), '', '');
      });

      const result = await getPullRequestStatus('/repo', 10);

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });
  });

  describe('mergeAndCleanup', () => {
    it('should merge PR and cleanup worktree', async () => {
      const commands = [];
      mockExec.mockImplementation((cmd, opts, callback) => {
        commands.push(cmd);
        if (cmd.includes('branch --show-current')) {
          callback(null, 'task/10-feature\n', '');
        } else if (cmd.includes('symbolic-ref')) {
          callback(null, 'main\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await mergeAndCleanup('/repo', 10);

      expect(result.success).toBe(true);
      expect(commands.some(c => c.includes('gh pr merge'))).toBe(true);
      expect(commands.some(c => c.includes('git worktree remove'))).toBe(true);
      expect(commands.some(c => c.includes('git branch -D'))).toBe(true);
      expect(commands.some(c => c.includes('git checkout'))).toBe(true);
      expect(commands.some(c => c.includes('git pull'))).toBe(true);
    });

    it('should return error on merge failure', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        if (cmd.includes('branch --show-current')) {
          callback(null, 'task/10-feature\n', '');
        } else if (cmd.includes('symbolic-ref')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('gh pr merge')) {
          callback(new Error('PR is not mergeable'), '', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await mergeAndCleanup('/repo', 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not mergeable');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, ' M src/file.js\n?? newfile.txt\n', '');
      });

      const result = await hasUncommittedChanges('/repo', 10);

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
    });

    it('should return false when working tree is clean', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(null, '', '');
      });

      const result = await hasUncommittedChanges('/repo', 10);

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
    });

    it('should return error when git status fails', async () => {
      mockExec.mockImplementation((cmd, opts, callback) => {
        callback(new Error('not a git repository'), '', '');
      });

      const result = await hasUncommittedChanges('/repo', 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });
  });
});
