import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates a fresh in-memory SQLite database for testing.
 * Returns the database instance and helper functions.
 */
export function createTestDatabase() {
  // Create an in-memory database
  const db = new Database(':memory:');

  // Read and execute the init.sql to create all tables
  const initSqlPath = path.join(__dirname, '../database/init.sql');
  const initSql = fs.readFileSync(initSqlPath, 'utf8');
  db.exec(initSql);

  // Create helper functions that mirror the db.js operations but use this test db
  const userDb = {
    createUser: (username, passwordHash) => {
      const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
      const result = stmt.run(username, passwordHash);
      return { id: result.lastInsertRowid, username };
    },
    getUserById: (userId) => {
      return db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
    },
    hasUsers: () => {
      const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return row.count > 0;
    },
    getFirstUser: () => {
      return db.prepare('SELECT id, username, created_at, last_login FROM users WHERE is_active = 1 LIMIT 1').get();
    },
    getUserByUsername: (username) => {
      return db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    },
    updateLastLogin: (userId) => {
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    },
    updateGitConfig: (userId, gitName, gitEmail) => {
      db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?').run(gitName, gitEmail, userId);
    },
    getGitConfig: (userId) => {
      return db.prepare('SELECT git_name, git_email FROM users WHERE id = ?').get(userId);
    },
    completeOnboarding: (userId) => {
      db.prepare('UPDATE users SET has_completed_onboarding = 1 WHERE id = ?').run(userId);
    },
    hasCompletedOnboarding: (userId) => {
      const row = db.prepare('SELECT has_completed_onboarding FROM users WHERE id = ?').get(userId);
      return row?.has_completed_onboarding === 1;
    }
  };

  const projectsDb = {
    create: (userId, name, repoFolderPath) => {
      const stmt = db.prepare('INSERT INTO projects (user_id, name, repo_folder_path) VALUES (?, ?, ?)');
      const result = stmt.run(userId, name, repoFolderPath);
      return { id: result.lastInsertRowid, userId, name, repoFolderPath };
    },
    getAll: (userId) => {
      return db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
    },
    getById: (id, userId) => {
      return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
    },
    update: (id, userId, updates) => {
      const allowedFields = ['name', 'repo_folder_path'];
      const setClause = [];
      const values = [];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClause.push(`${field === 'repo_folder_path' ? 'repo_folder_path' : field} = ?`);
          values.push(updates[field]);
        }
      }

      if (setClause.length === 0) {
        return projectsDb.getById(id, userId);
      }

      setClause.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id, userId);

      const stmt = db.prepare(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ? AND user_id = ?`);
      const result = stmt.run(...values);

      if (result.changes === 0) {
        return null;
      }

      return projectsDb.getById(id, userId);
    },
    delete: (id, userId) => {
      const stmt = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?');
      const result = stmt.run(id, userId);
      return result.changes > 0;
    }
  };

  const tasksDb = {
    create: (projectId, title = null) => {
      const stmt = db.prepare('INSERT INTO tasks (project_id, title, status) VALUES (?, ?, ?)');
      const result = stmt.run(projectId, title, 'pending');
      return { id: result.lastInsertRowid, projectId, title, status: 'pending' };
    },
    getAll: (userId, status = null) => {
      let query = `
        SELECT t.*, p.name as project_name, p.repo_folder_path
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = ?
      `;
      const params = [userId];

      if (status) {
        query += ' AND t.status = ?';
        params.push(status);
      }

      query += ' ORDER BY t.updated_at DESC LIMIT 50';

      return db.prepare(query).all(...params);
    },
    getByProject: (projectId) => {
      return db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    },
    getById: (id) => {
      return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    },
    getWithProject: (taskId) => {
      return db.prepare(`
        SELECT t.*, p.user_id, p.name as project_name, p.repo_folder_path
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = ?
      `).get(taskId);
    },
    update: (id, updates) => {
      const allowedFields = ['title', 'status', 'workflow_complete'];
      const setClause = [];
      const values = [];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClause.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (setClause.length === 0) {
        return tasksDb.getById(id);
      }

      setClause.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const stmt = db.prepare(`UPDATE tasks SET ${setClause.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      if (result.changes === 0) {
        return null;
      }

      return tasksDb.getById(id);
    },
    updateStatus: (id, status) => {
      const validStatuses = ['pending', 'in_progress', 'completed'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
      }
      return tasksDb.update(id, { status });
    },
    delete: (id) => {
      const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    }
  };

  const agentRunsDb = {
    create: (taskId, agentType, conversationId = null) => {
      const stmt = db.prepare(`
        INSERT INTO task_agent_runs (task_id, agent_type, status, conversation_id)
        VALUES (?, ?, 'running', ?)
      `);
      const result = stmt.run(taskId, agentType, conversationId);
      return {
        id: result.lastInsertRowid,
        task_id: taskId,
        agent_type: agentType,
        status: 'running',
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        completed_at: null
      };
    },
    getByTask: (taskId) => {
      return db.prepare(`
        SELECT * FROM task_agent_runs
        WHERE task_id = ?
        ORDER BY created_at DESC
      `).all(taskId);
    },
    getById: (id) => {
      return db.prepare('SELECT * FROM task_agent_runs WHERE id = ?').get(id);
    },
    getByTaskAndType: (taskId, agentType) => {
      return db.prepare(`
        SELECT * FROM task_agent_runs
        WHERE task_id = ? AND agent_type = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(taskId, agentType);
    },
    updateStatus: (id, status) => {
      const validStatuses = ['pending', 'running', 'completed', 'failed'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
      }

      let stmt;
      if (status === 'completed') {
        stmt = db.prepare(`
          UPDATE task_agent_runs
          SET status = ?, completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
      } else {
        stmt = db.prepare(`
          UPDATE task_agent_runs
          SET status = ?, completed_at = NULL
          WHERE id = ?
        `);
      }
      stmt.run(status, id);
      return agentRunsDb.getById(id);
    },
    linkConversation: (id, conversationId) => {
      const stmt = db.prepare(`
        UPDATE task_agent_runs
        SET conversation_id = ?
        WHERE id = ?
      `);
      stmt.run(conversationId, id);
      return agentRunsDb.getById(id);
    },
    delete: (id) => {
      const stmt = db.prepare('DELETE FROM task_agent_runs WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    }
  };

  const conversationsDb = {
    create: (taskId) => {
      const stmt = db.prepare('INSERT INTO conversations (task_id) VALUES (?)');
      const result = stmt.run(taskId);
      return { id: result.lastInsertRowid, taskId, claudeConversationId: null };
    },
    getByTask: (taskId) => {
      return db.prepare('SELECT * FROM conversations WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
    },
    getById: (id) => {
      return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    },
    updateClaudeId: (id, claudeConversationId) => {
      const stmt = db.prepare('UPDATE conversations SET claude_conversation_id = ? WHERE id = ?');
      const result = stmt.run(claudeConversationId, id);
      return result.changes > 0;
    },
    delete: (id) => {
      const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    }
  };

  return {
    db,
    userDb,
    projectsDb,
    tasksDb,
    conversationsDb,
    agentRunsDb,
    close: () => db.close()
  };
}
