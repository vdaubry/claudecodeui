import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

// Use DATABASE_PATH environment variable if set, otherwise use default location
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Ensure database directory exists if custom path is provided
if (process.env.DATABASE_PATH) {
  const dbDir = path.dirname(DB_PATH);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }
  } catch (error) {
    console.error(`Failed to create database directory ${dbDir}:`, error.message);
    throw error;
  }
}

// Create database connection
const db = new Database(DB_PATH);

// Enable foreign key constraints (required for CASCADE to work)
db.pragma('foreign_keys = ON');

// Show app installation path prominently
const appInstallPath = path.join(__dirname, '../..');
console.log('');
console.log(c.dim('═'.repeat(60)));
console.log(`${c.info('[INFO]')} App Installation: ${c.bright(appInstallPath)}`);
console.log(`${c.info('[INFO]')} Database: ${c.dim(path.relative(appInstallPath, DB_PATH))}`);
if (process.env.DATABASE_PATH) {
  console.log(`       ${c.dim('(Using custom DATABASE_PATH from environment)')}`);
}
console.log(c.dim('═'.repeat(60)));
console.log('');

const runMigrations = () => {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('git_name')) {
      console.log('Running migration: Adding git_name column');
      db.exec('ALTER TABLE users ADD COLUMN git_name TEXT');
    }

    if (!columnNames.includes('git_email')) {
      console.log('Running migration: Adding git_email column');
      db.exec('ALTER TABLE users ADD COLUMN git_email TEXT');
    }

    if (!columnNames.includes('has_completed_onboarding')) {
      console.log('Running migration: Adding has_completed_onboarding column');
      db.exec('ALTER TABLE users ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT 0');
    }

    // Tasks table migrations
    const tasksTableInfo = db.prepare("PRAGMA table_info(tasks)").all();
    const taskColumnNames = tasksTableInfo.map(col => col.name);

    if (!taskColumnNames.includes('status')) {
      console.log('Running migration: Adding status column to tasks');
      db.exec("ALTER TABLE tasks ADD COLUMN status TEXT DEFAULT 'pending'");
      // Create index for status column
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    }

    if (!taskColumnNames.includes('workflow_complete')) {
      console.log('Running migration: Adding workflow_complete column to tasks');
      db.exec('ALTER TABLE tasks ADD COLUMN workflow_complete INTEGER DEFAULT 0 NOT NULL');
    }

    if (!taskColumnNames.includes('planification_complete')) {
      console.log('Running migration: Adding planification_complete column to tasks');
      db.exec('ALTER TABLE tasks ADD COLUMN planification_complete INTEGER DEFAULT 0 NOT NULL');
    }

    // Task Agent Runs table migration (for existing databases)
    try {
      db.prepare("SELECT 1 FROM task_agent_runs LIMIT 1").get();
    } catch (e) {
      if (e.message.includes('no such table')) {
        console.log('Running migration: Creating task_agent_runs table');
        db.exec(`
          CREATE TABLE IF NOT EXISTS task_agent_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              task_id INTEGER NOT NULL,
              agent_type TEXT NOT NULL CHECK(agent_type IN ('planification', 'implementation', 'review')),
              status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
              conversation_id INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              completed_at DATETIME,
              FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS idx_task_agent_runs_task_id ON task_agent_runs(task_id);
        `);
      }
    }

    // Custom Agents table migration (for existing databases)
    try {
      db.prepare("SELECT 1 FROM agents LIMIT 1").get();
    } catch (e) {
      if (e.message.includes('no such table')) {
        console.log('Running migration: Creating agents table');
        db.exec(`
          CREATE TABLE IF NOT EXISTS agents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
        `);
      }
    }

    // Conversations table migration: Add agent_id column and make task_id nullable
    // This supports conversations belonging to either a task OR an agent
    const convTableInfo = db.prepare("PRAGMA table_info(conversations)").all();
    const convColumnNames = convTableInfo.map(col => col.name);

    if (!convColumnNames.includes('agent_id')) {
      console.log('Running migration: Updating conversations table for agent support');

      // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
      db.exec(`
        -- Create new table with nullable task_id and agent_id
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

        -- Copy existing data (all existing conversations have task_id)
        INSERT INTO conversations_new (id, task_id, agent_id, claude_conversation_id, created_at)
        SELECT id, task_id, NULL, claude_conversation_id, created_at
        FROM conversations;

        -- Drop old table and rename new one
        DROP TABLE conversations;
        ALTER TABLE conversations_new RENAME TO conversations;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_conversations_task_id ON conversations(task_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_claude_id ON conversations(claude_conversation_id);
      `);
    }

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error.message);
    throw error;
  }
};

// Initialize database with schema
const initializeDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    db.exec(initSQL);
    console.log('Database initialized successfully');
    runMigrations();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
};

// User database operations
const userDb = {
  // Check if any users exist
  hasUsers: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return row.count > 0;
    } catch (err) {
      throw err;
    }
  },

  // Create a new user
  createUser: (username, passwordHash) => {
    try {
      const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
      const result = stmt.run(username, passwordHash);
      return { id: result.lastInsertRowid, username };
    } catch (err) {
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username) => {
    try {
      const row = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId) => {
    try {
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user by ID
  getUserById: (userId) => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  getFirstUser: () => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE is_active = 1 LIMIT 1').get();
      return row;
    } catch (err) {
      throw err;
    }
  },

  updateGitConfig: (userId, gitName, gitEmail) => {
    try {
      const stmt = db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?');
      stmt.run(gitName, gitEmail, userId);
    } catch (err) {
      throw err;
    }
  },

  getGitConfig: (userId) => {
    try {
      const row = db.prepare('SELECT git_name, git_email FROM users WHERE id = ?').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  completeOnboarding: (userId) => {
    try {
      const stmt = db.prepare('UPDATE users SET has_completed_onboarding = 1 WHERE id = ?');
      stmt.run(userId);
    } catch (err) {
      throw err;
    }
  },

  hasCompletedOnboarding: (userId) => {
    try {
      const row = db.prepare('SELECT has_completed_onboarding FROM users WHERE id = ?').get(userId);
      return row?.has_completed_onboarding === 1;
    } catch (err) {
      throw err;
    }
  }
};

// Projects database operations
const projectsDb = {
  // Create a new project
  create: (userId, name, repoFolderPath) => {
    try {
      const stmt = db.prepare('INSERT INTO projects (user_id, name, repo_folder_path) VALUES (?, ?, ?)');
      const result = stmt.run(userId, name, repoFolderPath);
      return { id: result.lastInsertRowid, userId, name, repoFolderPath };
    } catch (err) {
      throw err;
    }
  },

  // Get all projects for a user
  getAll: (userId) => {
    try {
      const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get project by ID (with user ownership check)
  getById: (id, userId) => {
    try {
      const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update a project
  update: (id, userId, updates) => {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  // Delete a project
  delete: (id, userId) => {
    try {
      const stmt = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?');
      const result = stmt.run(id, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// Tasks database operations
const tasksDb = {
  // Create a new task (status defaults to 'pending')
  create: (projectId, title = null) => {
    try {
      const stmt = db.prepare('INSERT INTO tasks (project_id, title, status) VALUES (?, ?, ?)');
      const result = stmt.run(projectId, title, 'pending');
      return { id: result.lastInsertRowid, projectId, title, status: 'pending' };
    } catch (err) {
      throw err;
    }
  },

  // Get all tasks across all projects for a user, with optional status filter
  // Returns max 50 tasks, ordered by updated_at DESC
  getAll: (userId, status = null) => {
    try {
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

      const rows = db.prepare(query).all(...params);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get all tasks for a project
  getByProject: (projectId) => {
    try {
      const rows = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get task by ID
  getById: (id) => {
    try {
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Get task with its project (JOIN)
  getWithProject: (taskId) => {
    try {
      const row = db.prepare(`
        SELECT t.*, p.user_id, p.name as project_name, p.repo_folder_path
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = ?
      `).get(taskId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update a task
  update: (id, updates) => {
    try {
      const allowedFields = ['title', 'status', 'workflow_complete', 'planification_complete'];
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
    } catch (err) {
      throw err;
    }
  },

  // Update task status
  updateStatus: (id, status) => {
    try {
      const validStatuses = ['pending', 'in_progress', 'completed'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
      }
      return tasksDb.update(id, { status });
    } catch (err) {
      throw err;
    }
  },

  // Delete a task
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Get old completed tasks (those beyond the first N newest completed tasks)
  getOldCompletedTasks: (projectId, keepCount = 20) => {
    try {
      const rows = db.prepare(`
        SELECT id FROM tasks
        WHERE project_id = ? AND status = 'completed'
        ORDER BY updated_at DESC
        LIMIT -1 OFFSET ?
      `).all(projectId, keepCount);
      return rows.map(r => r.id);
    } catch (err) {
      throw err;
    }
  }
};

// Conversations database operations
const conversationsDb = {
  // Create a new conversation for a task
  create: (taskId) => {
    try {
      const stmt = db.prepare('INSERT INTO conversations (task_id, agent_id) VALUES (?, NULL)');
      const result = stmt.run(taskId);
      return { id: result.lastInsertRowid, task_id: taskId, agent_id: null, claude_conversation_id: null };
    } catch (err) {
      throw err;
    }
  },

  // Create a new conversation for an agent
  createForAgent: (agentId) => {
    try {
      const stmt = db.prepare('INSERT INTO conversations (task_id, agent_id) VALUES (NULL, ?)');
      const result = stmt.run(agentId);
      return { id: result.lastInsertRowid, task_id: null, agent_id: agentId, claude_conversation_id: null };
    } catch (err) {
      throw err;
    }
  },

  // Get all conversations for a task
  getByTask: (taskId) => {
    try {
      const rows = db.prepare('SELECT * FROM conversations WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get all conversations for an agent
  getByAgent: (agentId) => {
    try {
      const rows = db.prepare('SELECT * FROM conversations WHERE agent_id = ? ORDER BY created_at DESC').all(agentId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get conversation by ID
  getById: (id) => {
    try {
      const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update Claude conversation ID
  updateClaudeId: (id, claudeConversationId) => {
    try {
      const stmt = db.prepare('UPDATE conversations SET claude_conversation_id = ? WHERE id = ?');
      const result = stmt.run(claudeConversationId, id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Delete a conversation
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// Agent Runs database operations
const agentRunsDb = {
  // Create a new agent run
  create: (taskId, agentType, conversationId = null) => {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  // Get all agent runs for a task
  getByTask: (taskId) => {
    try {
      const rows = db.prepare(`
        SELECT * FROM task_agent_runs
        WHERE task_id = ?
        ORDER BY created_at DESC
      `).all(taskId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get agent run by ID
  getById: (id) => {
    try {
      const row = db.prepare('SELECT * FROM task_agent_runs WHERE id = ?').get(id);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Get specific agent run for a task by type (most recent)
  getByTaskAndType: (taskId, agentType) => {
    try {
      const row = db.prepare(`
        SELECT * FROM task_agent_runs
        WHERE task_id = ? AND agent_type = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(taskId, agentType);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update agent run status
  updateStatus: (id, status) => {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  // Link conversation to agent run
  linkConversation: (id, conversationId) => {
    try {
      const stmt = db.prepare(`
        UPDATE task_agent_runs
        SET conversation_id = ?
        WHERE id = ?
      `);
      stmt.run(conversationId, id);
      return agentRunsDb.getById(id);
    } catch (err) {
      throw err;
    }
  },

  // Delete agent run
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM task_agent_runs WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// Custom Agents database operations
const agentsDb = {
  // Create a new agent
  create: (projectId, name) => {
    try {
      const stmt = db.prepare('INSERT INTO agents (project_id, name) VALUES (?, ?)');
      const result = stmt.run(projectId, name);
      return { id: result.lastInsertRowid, project_id: projectId, name };
    } catch (err) {
      throw err;
    }
  },

  // Get all agents for a project
  getByProject: (projectId) => {
    try {
      const rows = db.prepare('SELECT * FROM agents WHERE project_id = ? ORDER BY name ASC').all(projectId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get agent by ID
  getById: (id) => {
    try {
      const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Get agent with its project (JOIN) - for ownership verification and getting project path
  getWithProject: (agentId) => {
    try {
      const row = db.prepare(`
        SELECT a.*, p.user_id, p.name as project_name, p.repo_folder_path
        FROM agents a
        JOIN projects p ON a.project_id = p.id
        WHERE a.id = ?
      `).get(agentId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update an agent
  update: (id, updates) => {
    try {
      const allowedFields = ['name'];
      const setClause = [];
      const values = [];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClause.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (setClause.length === 0) {
        return agentsDb.getById(id);
      }

      setClause.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const stmt = db.prepare(`UPDATE agents SET ${setClause.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      if (result.changes === 0) {
        return null;
      }

      return agentsDb.getById(id);
    } catch (err) {
      throw err;
    }
  },

  // Delete an agent
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

export {
  db,
  initializeDatabase,
  userDb,
  projectsDb,
  tasksDb,
  conversationsDb,
  agentRunsDb,
  agentsDb
};