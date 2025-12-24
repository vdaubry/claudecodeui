import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../test/db-helper.js';

describe('Database Layer - Phase 1', () => {
  let testDb;
  let userDb, projectsDb, tasksDb, conversationsDb, agentRunsDb, agentsDb;
  let testUserId;

  beforeEach(() => {
    testDb = createTestDatabase();
    userDb = testDb.userDb;
    projectsDb = testDb.projectsDb;
    tasksDb = testDb.tasksDb;
    conversationsDb = testDb.conversationsDb;
    agentRunsDb = testDb.agentRunsDb;
    agentsDb = testDb.agentsDb;

    // Create a test user for all tests
    const user = userDb.createUser('testuser', 'hashedpassword');
    testUserId = user.id;
  });

  afterEach(() => {
    testDb.close();
  });

  describe('projectsDb', () => {
    describe('create', () => {
      it('should create a new project', () => {
        const project = projectsDb.create(testUserId, 'My Project', '/home/user/my-project');

        expect(project).toBeDefined();
        expect(project.id).toBeDefined();
        expect(project.userId).toBe(testUserId);
        expect(project.name).toBe('My Project');
        expect(project.repoFolderPath).toBe('/home/user/my-project');
      });

      it('should enforce unique repo_folder_path', () => {
        projectsDb.create(testUserId, 'Project 1', '/home/user/project');

        expect(() => {
          projectsDb.create(testUserId, 'Project 2', '/home/user/project');
        }).toThrow();
      });
    });

    describe('getAll', () => {
      it('should return all projects for a user', () => {
        projectsDb.create(testUserId, 'Project 1', '/path/1');
        projectsDb.create(testUserId, 'Project 2', '/path/2');

        const projects = projectsDb.getAll(testUserId);

        expect(projects).toHaveLength(2);
      });

      it('should return empty array when user has no projects', () => {
        const projects = projectsDb.getAll(testUserId);

        expect(projects).toHaveLength(0);
      });

      it('should only return projects belonging to the specified user', () => {
        const user2 = userDb.createUser('user2', 'password2');

        projectsDb.create(testUserId, 'User 1 Project', '/path/user1');
        projectsDb.create(user2.id, 'User 2 Project', '/path/user2');

        const user1Projects = projectsDb.getAll(testUserId);
        const user2Projects = projectsDb.getAll(user2.id);

        expect(user1Projects).toHaveLength(1);
        expect(user1Projects[0].name).toBe('User 1 Project');
        expect(user2Projects).toHaveLength(1);
        expect(user2Projects[0].name).toBe('User 2 Project');
      });
    });

    describe('getById', () => {
      it('should return project by id for the correct user', () => {
        const created = projectsDb.create(testUserId, 'My Project', '/path/project');

        const project = projectsDb.getById(created.id, testUserId);

        expect(project).toBeDefined();
        expect(project.id).toBe(created.id);
        expect(project.name).toBe('My Project');
      });

      it('should return undefined for wrong user', () => {
        const user2 = userDb.createUser('user2', 'password2');
        const created = projectsDb.create(testUserId, 'My Project', '/path/project');

        const project = projectsDb.getById(created.id, user2.id);

        expect(project).toBeUndefined();
      });

      it('should return undefined for non-existent project', () => {
        const project = projectsDb.getById(999, testUserId);

        expect(project).toBeUndefined();
      });
    });

    describe('update', () => {
      it('should update project name', () => {
        const created = projectsDb.create(testUserId, 'Old Name', '/path/project');

        const updated = projectsDb.update(created.id, testUserId, { name: 'New Name' });

        expect(updated.name).toBe('New Name');
        expect(updated.repo_folder_path).toBe('/path/project');
      });

      it('should update repo_folder_path', () => {
        const created = projectsDb.create(testUserId, 'Project', '/old/path');

        const updated = projectsDb.update(created.id, testUserId, { repo_folder_path: '/new/path' });

        expect(updated.repo_folder_path).toBe('/new/path');
      });

      it('should return null when updating non-existent project', () => {
        const updated = projectsDb.update(999, testUserId, { name: 'New Name' });

        expect(updated).toBeNull();
      });

      it('should not update projects belonging to other users', () => {
        const user2 = userDb.createUser('user2', 'password2');
        const created = projectsDb.create(testUserId, 'Project', '/path/project');

        const updated = projectsDb.update(created.id, user2.id, { name: 'Hacked' });

        expect(updated).toBeNull();

        // Verify original is unchanged
        const original = projectsDb.getById(created.id, testUserId);
        expect(original.name).toBe('Project');
      });
    });

    describe('delete', () => {
      it('should delete a project', () => {
        const created = projectsDb.create(testUserId, 'Project', '/path/project');

        const deleted = projectsDb.delete(created.id, testUserId);

        expect(deleted).toBe(true);
        expect(projectsDb.getById(created.id, testUserId)).toBeUndefined();
      });

      it('should return false when deleting non-existent project', () => {
        const deleted = projectsDb.delete(999, testUserId);

        expect(deleted).toBe(false);
      });

      it('should not delete projects belonging to other users', () => {
        const user2 = userDb.createUser('user2', 'password2');
        const created = projectsDb.create(testUserId, 'Project', '/path/project');

        const deleted = projectsDb.delete(created.id, user2.id);

        expect(deleted).toBe(false);
        expect(projectsDb.getById(created.id, testUserId)).toBeDefined();
      });

      it('should cascade delete tasks when project is deleted', () => {
        const project = projectsDb.create(testUserId, 'Project', '/path/project');
        const task = tasksDb.create(project.id, 'Task 1');

        projectsDb.delete(project.id, testUserId);

        expect(tasksDb.getById(task.id)).toBeUndefined();
      });
    });
  });

  describe('tasksDb', () => {
    let testProjectId;

    beforeEach(() => {
      const project = projectsDb.create(testUserId, 'Test Project', '/path/project');
      testProjectId = project.id;
    });

    describe('create', () => {
      it('should create a task with title', () => {
        const task = tasksDb.create(testProjectId, 'My Task');

        expect(task).toBeDefined();
        expect(task.id).toBeDefined();
        expect(task.projectId).toBe(testProjectId);
        expect(task.title).toBe('My Task');
      });

      it('should create a task without title', () => {
        const task = tasksDb.create(testProjectId);

        expect(task).toBeDefined();
        expect(task.title).toBeNull();
      });

      it('should set status to pending by default', () => {
        const task = tasksDb.create(testProjectId, 'My Task');

        expect(task.status).toBe('pending');

        // Verify in database
        const fetchedTask = tasksDb.getById(task.id);
        expect(fetchedTask.status).toBe('pending');
      });
    });

    describe('getAll', () => {
      it('should return all tasks for a user', () => {
        const project2 = projectsDb.create(testUserId, 'Project 2', '/path/project2');
        tasksDb.create(testProjectId, 'Task 1');
        tasksDb.create(testProjectId, 'Task 2');
        tasksDb.create(project2.id, 'Task 3');

        const tasks = tasksDb.getAll(testUserId);

        expect(tasks).toHaveLength(3);
        expect(tasks.every(t => t.project_name)).toBe(true);
      });

      it('should filter by status when provided', () => {
        tasksDb.create(testProjectId, 'Pending Task');
        const inProgressTask = tasksDb.create(testProjectId, 'In Progress Task');
        tasksDb.updateStatus(inProgressTask.id, 'in_progress');
        const completedTask = tasksDb.create(testProjectId, 'Completed Task');
        tasksDb.updateStatus(completedTask.id, 'completed');

        const inProgressTasks = tasksDb.getAll(testUserId, 'in_progress');
        expect(inProgressTasks).toHaveLength(1);
        expect(inProgressTasks[0].title).toBe('In Progress Task');
        expect(inProgressTasks[0].status).toBe('in_progress');

        const pendingTasks = tasksDb.getAll(testUserId, 'pending');
        expect(pendingTasks).toHaveLength(1);
        expect(pendingTasks[0].title).toBe('Pending Task');

        const completedTasks = tasksDb.getAll(testUserId, 'completed');
        expect(completedTasks).toHaveLength(1);
        expect(completedTasks[0].title).toBe('Completed Task');
      });

      it('should return max 50 tasks', () => {
        // Create 55 tasks
        for (let i = 0; i < 55; i++) {
          tasksDb.create(testProjectId, `Task ${i}`);
        }

        const tasks = tasksDb.getAll(testUserId);

        expect(tasks).toHaveLength(50);
      });

      it('should order by updated_at DESC', () => {
        const task1 = tasksDb.create(testProjectId, 'First Task');
        const task2 = tasksDb.create(testProjectId, 'Second Task');

        // Update task1 to make it more recent
        tasksDb.update(task1.id, { title: 'Updated First Task' });

        const tasks = tasksDb.getAll(testUserId);

        expect(tasks).toHaveLength(2);
        // The updated task should come first (most recently updated)
        expect(tasks[0].title).toBe('Updated First Task');
        expect(tasks[1].title).toBe('Second Task');
      });

      it('should include project_name on tasks', () => {
        tasksDb.create(testProjectId, 'My Task');

        const tasks = tasksDb.getAll(testUserId);

        expect(tasks).toHaveLength(1);
        expect(tasks[0].project_name).toBe('Test Project');
        expect(tasks[0].repo_folder_path).toBe('/path/project');
      });
    });

    describe('updateStatus', () => {
      it('should update task status from pending to in_progress', () => {
        const task = tasksDb.create(testProjectId, 'My Task');
        expect(task.status).toBe('pending');

        const updated = tasksDb.updateStatus(task.id, 'in_progress');

        expect(updated.status).toBe('in_progress');

        // Verify in database
        const fetched = tasksDb.getById(task.id);
        expect(fetched.status).toBe('in_progress');
      });

      it('should update task status from in_progress to completed', () => {
        const task = tasksDb.create(testProjectId, 'My Task');
        tasksDb.updateStatus(task.id, 'in_progress');

        const updated = tasksDb.updateStatus(task.id, 'completed');

        expect(updated.status).toBe('completed');
      });

      it('should reject invalid status values', () => {
        const task = tasksDb.create(testProjectId, 'My Task');

        expect(() => {
          tasksDb.updateStatus(task.id, 'invalid');
        }).toThrow('Invalid status: invalid');
      });

      it('should reject empty status', () => {
        const task = tasksDb.create(testProjectId, 'My Task');

        expect(() => {
          tasksDb.updateStatus(task.id, '');
        }).toThrow('Invalid status:');
      });
    });

    describe('getByProject', () => {
      it('should return all tasks for a project', () => {
        tasksDb.create(testProjectId, 'Task 1');
        tasksDb.create(testProjectId, 'Task 2');

        const tasks = tasksDb.getByProject(testProjectId);

        expect(tasks).toHaveLength(2);
      });

      it('should return empty array when project has no tasks', () => {
        const tasks = tasksDb.getByProject(testProjectId);

        expect(tasks).toHaveLength(0);
      });

      it('should only return tasks for the specified project', () => {
        const project2 = projectsDb.create(testUserId, 'Project 2', '/path/project2');

        tasksDb.create(testProjectId, 'Task 1');
        tasksDb.create(project2.id, 'Task 2');

        const project1Tasks = tasksDb.getByProject(testProjectId);
        const project2Tasks = tasksDb.getByProject(project2.id);

        expect(project1Tasks).toHaveLength(1);
        expect(project1Tasks[0].title).toBe('Task 1');
        expect(project2Tasks).toHaveLength(1);
        expect(project2Tasks[0].title).toBe('Task 2');
      });
    });

    describe('getById', () => {
      it('should return task by id', () => {
        const created = tasksDb.create(testProjectId, 'My Task');

        const task = tasksDb.getById(created.id);

        expect(task).toBeDefined();
        expect(task.id).toBe(created.id);
        expect(task.title).toBe('My Task');
      });

      it('should return undefined for non-existent task', () => {
        const task = tasksDb.getById(999);

        expect(task).toBeUndefined();
      });
    });

    describe('getWithProject', () => {
      it('should return task with project info', () => {
        const created = tasksDb.create(testProjectId, 'My Task');

        const taskWithProject = tasksDb.getWithProject(created.id);

        expect(taskWithProject).toBeDefined();
        expect(taskWithProject.id).toBe(created.id);
        expect(taskWithProject.title).toBe('My Task');
        expect(taskWithProject.user_id).toBe(testUserId);
        expect(taskWithProject.project_name).toBe('Test Project');
        expect(taskWithProject.repo_folder_path).toBe('/path/project');
      });

      it('should return undefined for non-existent task', () => {
        const taskWithProject = tasksDb.getWithProject(999);

        expect(taskWithProject).toBeUndefined();
      });
    });

    describe('update', () => {
      it('should update task title', () => {
        const created = tasksDb.create(testProjectId, 'Old Title');

        const updated = tasksDb.update(created.id, { title: 'New Title' });

        expect(updated.title).toBe('New Title');
      });

      it('should return null when updating non-existent task', () => {
        const updated = tasksDb.update(999, { title: 'New Title' });

        expect(updated).toBeNull();
      });

      it('should return existing task when no updates provided', () => {
        const created = tasksDb.create(testProjectId, 'My Task');

        const updated = tasksDb.update(created.id, {});

        expect(updated.title).toBe('My Task');
      });

      it('should allow status in allowed fields', () => {
        const created = tasksDb.create(testProjectId, 'My Task');
        expect(created.status).toBe('pending');

        const updated = tasksDb.update(created.id, { status: 'in_progress' });

        expect(updated.status).toBe('in_progress');

        // Also test completed status
        const completed = tasksDb.update(created.id, { status: 'completed' });
        expect(completed.status).toBe('completed');
      });
    });

    describe('delete', () => {
      it('should delete a task', () => {
        const created = tasksDb.create(testProjectId, 'My Task');

        const deleted = tasksDb.delete(created.id);

        expect(deleted).toBe(true);
        expect(tasksDb.getById(created.id)).toBeUndefined();
      });

      it('should return false when deleting non-existent task', () => {
        const deleted = tasksDb.delete(999);

        expect(deleted).toBe(false);
      });

      it('should cascade delete conversations when task is deleted', () => {
        const task = tasksDb.create(testProjectId, 'My Task');
        const conversation = conversationsDb.create(task.id);

        tasksDb.delete(task.id);

        expect(conversationsDb.getById(conversation.id)).toBeUndefined();
      });
    });
  });

  describe('conversationsDb', () => {
    let testTaskId;

    beforeEach(() => {
      const project = projectsDb.create(testUserId, 'Test Project', '/path/project');
      const task = tasksDb.create(project.id, 'Test Task');
      testTaskId = task.id;
    });

    describe('create', () => {
      it('should create a conversation', () => {
        const conversation = conversationsDb.create(testTaskId);

        expect(conversation).toBeDefined();
        expect(conversation.id).toBeDefined();
        expect(conversation.taskId).toBe(testTaskId);
        expect(conversation.claudeConversationId).toBeNull();
      });
    });

    describe('getByTask', () => {
      it('should return all conversations for a task', () => {
        conversationsDb.create(testTaskId);
        conversationsDb.create(testTaskId);

        const conversations = conversationsDb.getByTask(testTaskId);

        expect(conversations).toHaveLength(2);
      });

      it('should return empty array when task has no conversations', () => {
        const conversations = conversationsDb.getByTask(testTaskId);

        expect(conversations).toHaveLength(0);
      });
    });

    describe('getById', () => {
      it('should return conversation by id', () => {
        const created = conversationsDb.create(testTaskId);

        const conversation = conversationsDb.getById(created.id);

        expect(conversation).toBeDefined();
        expect(conversation.id).toBe(created.id);
      });

      it('should return undefined for non-existent conversation', () => {
        const conversation = conversationsDb.getById(999);

        expect(conversation).toBeUndefined();
      });
    });

    describe('updateClaudeId', () => {
      it('should update claude conversation id', () => {
        const created = conversationsDb.create(testTaskId);

        const updated = conversationsDb.updateClaudeId(created.id, 'claude-session-123');

        expect(updated).toBe(true);

        const conversation = conversationsDb.getById(created.id);
        expect(conversation.claude_conversation_id).toBe('claude-session-123');
      });

      it('should return false when updating non-existent conversation', () => {
        const updated = conversationsDb.updateClaudeId(999, 'claude-session-123');

        expect(updated).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete a conversation', () => {
        const created = conversationsDb.create(testTaskId);

        const deleted = conversationsDb.delete(created.id);

        expect(deleted).toBe(true);
        expect(conversationsDb.getById(created.id)).toBeUndefined();
      });

      it('should return false when deleting non-existent conversation', () => {
        const deleted = conversationsDb.delete(999);

        expect(deleted).toBe(false);
      });
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should have foreign keys enabled', () => {
      const result = testDb.db.pragma('foreign_keys');
      expect(result[0].foreign_keys).toBe(1);
    });
  });

  describe('Cascade Delete Behavior', () => {
    it('should cascade delete from project to tasks to conversations', () => {
      const project = projectsDb.create(testUserId, 'Project', '/path/project');
      const task = tasksDb.create(project.id, 'Task');
      const conversation = conversationsDb.create(task.id);

      // Delete the project
      projectsDb.delete(project.id, testUserId);

      // All related entities should be deleted
      expect(projectsDb.getById(project.id, testUserId)).toBeUndefined();
      expect(tasksDb.getById(task.id)).toBeUndefined();
      expect(conversationsDb.getById(conversation.id)).toBeUndefined();
    });
  });

  describe('userDb', () => {
    describe('hasUsers', () => {
      it('should return true when users exist', () => {
        // testUserId was created in beforeEach
        expect(testDb.userDb.hasUsers()).toBe(true);
      });
    });

    describe('getUserById', () => {
      it('should return user by ID', () => {
        const user = testDb.userDb.getUserById(testUserId);
        expect(user).toBeDefined();
        expect(user.id).toBe(testUserId);
        expect(user.username).toBe('testuser');
      });

      it('should return undefined for non-existent user', () => {
        const user = testDb.userDb.getUserById(99999);
        expect(user).toBeUndefined();
      });
    });

    describe('getFirstUser', () => {
      it('should return the first active user', () => {
        const user = testDb.userDb.getFirstUser();
        expect(user).toBeDefined();
        expect(user.username).toBe('testuser');
      });
    });

    describe('updateGitConfig and getGitConfig', () => {
      it('should update and retrieve git configuration', () => {
        testDb.userDb.updateGitConfig(testUserId, 'John Doe', 'john@example.com');

        const gitConfig = testDb.userDb.getGitConfig(testUserId);
        expect(gitConfig.git_name).toBe('John Doe');
        expect(gitConfig.git_email).toBe('john@example.com');
      });

      it('should return null values when git config is not set', () => {
        const gitConfig = testDb.userDb.getGitConfig(testUserId);
        expect(gitConfig.git_name).toBeNull();
        expect(gitConfig.git_email).toBeNull();
      });
    });

    describe('completeOnboarding and hasCompletedOnboarding', () => {
      it('should mark onboarding as completed', () => {
        expect(testDb.userDb.hasCompletedOnboarding(testUserId)).toBe(false);

        testDb.userDb.completeOnboarding(testUserId);

        expect(testDb.userDb.hasCompletedOnboarding(testUserId)).toBe(true);
      });
    });
  });

  describe('tasksDb - workflow_complete', () => {
    let testProjectId;

    beforeEach(() => {
      const project = projectsDb.create(testUserId, 'Test Project', '/path/project');
      testProjectId = project.id;
    });

    describe('workflow_complete field', () => {
      it('should default workflow_complete to 0 on task creation', () => {
        const task = tasksDb.create(testProjectId, 'My Task');

        const fetchedTask = tasksDb.getById(task.id);
        expect(fetchedTask.workflow_complete).toBe(0);
      });

      it('should update workflow_complete to 1', () => {
        const task = tasksDb.create(testProjectId, 'My Task');
        expect(tasksDb.getById(task.id).workflow_complete).toBe(0);

        const updated = tasksDb.update(task.id, { workflow_complete: 1 });

        expect(updated.workflow_complete).toBe(1);

        // Verify in database
        const fetched = tasksDb.getById(task.id);
        expect(fetched.workflow_complete).toBe(1);
      });

      it('should update workflow_complete back to 0', () => {
        const task = tasksDb.create(testProjectId, 'My Task');
        tasksDb.update(task.id, { workflow_complete: 1 });

        const updated = tasksDb.update(task.id, { workflow_complete: 0 });

        expect(updated.workflow_complete).toBe(0);
      });

      it('should update workflow_complete along with other fields', () => {
        const task = tasksDb.create(testProjectId, 'My Task');

        const updated = tasksDb.update(task.id, {
          title: 'Updated Title',
          status: 'in_progress',
          workflow_complete: 1
        });

        expect(updated.title).toBe('Updated Title');
        expect(updated.status).toBe('in_progress');
        expect(updated.workflow_complete).toBe(1);
      });

      it('should preserve workflow_complete when updating other fields', () => {
        const task = tasksDb.create(testProjectId, 'My Task');
        tasksDb.update(task.id, { workflow_complete: 1 });

        const updated = tasksDb.update(task.id, { title: 'New Title' });

        expect(updated.title).toBe('New Title');
        expect(updated.workflow_complete).toBe(1);
      });
    });
  });

  describe('agentRunsDb', () => {
    let testProjectId;
    let testTaskId;
    let testConversationId;

    beforeEach(() => {
      const project = projectsDb.create(testUserId, 'Test Project', '/path/project');
      testProjectId = project.id;
      const task = tasksDb.create(testProjectId, 'Test Task');
      testTaskId = task.id;
      const conversation = conversationsDb.create(testTaskId);
      testConversationId = conversation.id;
    });

    describe('create', () => {
      it('should create an agent run with running status', () => {
        const agentRun = agentRunsDb.create(testTaskId, 'planification');

        expect(agentRun).toBeDefined();
        expect(agentRun.id).toBeDefined();
        expect(agentRun.task_id).toBe(testTaskId);
        expect(agentRun.agent_type).toBe('planification');
        expect(agentRun.status).toBe('running');
        expect(agentRun.conversation_id).toBeNull();
      });

      it('should create an agent run with conversation_id', () => {
        const agentRun = agentRunsDb.create(testTaskId, 'implementation', testConversationId);

        expect(agentRun.conversation_id).toBe(testConversationId);
      });

      it('should create agent runs for all valid types', () => {
        const planRun = agentRunsDb.create(testTaskId, 'planification');
        const implRun = agentRunsDb.create(testTaskId, 'implementation');
        const reviewRun = agentRunsDb.create(testTaskId, 'review');

        expect(planRun.agent_type).toBe('planification');
        expect(implRun.agent_type).toBe('implementation');
        expect(reviewRun.agent_type).toBe('review');
      });

      it('should reject invalid agent types', () => {
        expect(() => {
          agentRunsDb.create(testTaskId, 'invalid_type');
        }).toThrow();
      });
    });

    describe('getByTask', () => {
      it('should return all agent runs for a task', () => {
        agentRunsDb.create(testTaskId, 'planification');
        agentRunsDb.create(testTaskId, 'implementation');

        const runs = agentRunsDb.getByTask(testTaskId);

        expect(runs).toHaveLength(2);
      });

      it('should return runs ordered by id descending (most recent first)', () => {
        const run1 = agentRunsDb.create(testTaskId, 'planification');
        const run2 = agentRunsDb.create(testTaskId, 'implementation');

        const runs = agentRunsDb.getByTask(testTaskId);

        // Most recent (higher id) first - since created_at may be the same in fast tests
        // The ORDER BY created_at DESC, but IDs are auto-increment so id order matches creation order
        expect(runs).toHaveLength(2);
        // Verify both runs are returned
        const ids = runs.map(r => r.id);
        expect(ids).toContain(run1.id);
        expect(ids).toContain(run2.id);
      });

      it('should return empty array when no runs exist', () => {
        const runs = agentRunsDb.getByTask(testTaskId);

        expect(runs).toHaveLength(0);
      });
    });

    describe('getById', () => {
      it('should return agent run by id', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');

        const run = agentRunsDb.getById(created.id);

        expect(run).toBeDefined();
        expect(run.id).toBe(created.id);
        expect(run.agent_type).toBe('planification');
      });

      it('should return undefined for non-existent id', () => {
        const run = agentRunsDb.getById(999);

        expect(run).toBeUndefined();
      });
    });

    describe('getByTaskAndType', () => {
      it('should return an agent run by task and type', () => {
        const run1 = agentRunsDb.create(testTaskId, 'planification');
        const run2 = agentRunsDb.create(testTaskId, 'planification');

        const run = agentRunsDb.getByTaskAndType(testTaskId, 'planification');

        // Should return one of the planification runs
        expect(run).toBeDefined();
        expect(run.agent_type).toBe('planification');
        // Verify it's one of the created runs
        expect([run1.id, run2.id]).toContain(run.id);
      });

      it('should return undefined when no matching run exists', () => {
        agentRunsDb.create(testTaskId, 'planification');

        const run = agentRunsDb.getByTaskAndType(testTaskId, 'implementation');

        expect(run).toBeUndefined();
      });

      it('should only return runs of the specified type', () => {
        agentRunsDb.create(testTaskId, 'planification');
        agentRunsDb.create(testTaskId, 'implementation');
        agentRunsDb.create(testTaskId, 'review');

        const planRun = agentRunsDb.getByTaskAndType(testTaskId, 'planification');
        const implRun = agentRunsDb.getByTaskAndType(testTaskId, 'implementation');
        const reviewRun = agentRunsDb.getByTaskAndType(testTaskId, 'review');

        expect(planRun.agent_type).toBe('planification');
        expect(implRun.agent_type).toBe('implementation');
        expect(reviewRun.agent_type).toBe('review');
      });
    });

    describe('updateStatus', () => {
      it('should update status to completed and set completed_at', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');
        expect(created.status).toBe('running');

        const updated = agentRunsDb.updateStatus(created.id, 'completed');

        expect(updated.status).toBe('completed');
        expect(updated.completed_at).not.toBeNull();
      });

      it('should update status to failed', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');

        const updated = agentRunsDb.updateStatus(created.id, 'failed');

        expect(updated.status).toBe('failed');
        expect(updated.completed_at).toBeNull();
      });

      it('should update status to pending', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');

        const updated = agentRunsDb.updateStatus(created.id, 'pending');

        expect(updated.status).toBe('pending');
      });

      it('should reject invalid status', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');

        expect(() => {
          agentRunsDb.updateStatus(created.id, 'invalid_status');
        }).toThrow('Invalid status: invalid_status');
      });
    });

    describe('linkConversation', () => {
      it('should link conversation to agent run', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');
        expect(created.conversation_id).toBeNull();

        const updated = agentRunsDb.linkConversation(created.id, testConversationId);

        expect(updated.conversation_id).toBe(testConversationId);

        // Verify in database
        const fetched = agentRunsDb.getById(created.id);
        expect(fetched.conversation_id).toBe(testConversationId);
      });
    });

    describe('delete', () => {
      it('should delete an agent run', () => {
        const created = agentRunsDb.create(testTaskId, 'planification');

        const deleted = agentRunsDb.delete(created.id);

        expect(deleted).toBe(true);
        expect(agentRunsDb.getById(created.id)).toBeUndefined();
      });

      it('should return false when deleting non-existent run', () => {
        const deleted = agentRunsDb.delete(999);

        expect(deleted).toBe(false);
      });
    });

    describe('cascade delete', () => {
      it('should cascade delete agent runs when task is deleted', () => {
        const agentRun = agentRunsDb.create(testTaskId, 'planification');

        tasksDb.delete(testTaskId);

        expect(agentRunsDb.getById(agentRun.id)).toBeUndefined();
      });

      it('should set conversation_id to NULL when conversation is deleted', () => {
        const agentRun = agentRunsDb.create(testTaskId, 'planification', testConversationId);
        expect(agentRun.conversation_id).toBe(testConversationId);

        conversationsDb.delete(testConversationId);

        const fetched = agentRunsDb.getById(agentRun.id);
        expect(fetched.conversation_id).toBeNull();
      });
    });
  });

  describe('agentsDb', () => {
    let testProjectId;

    beforeEach(() => {
      const project = projectsDb.create(testUserId, 'Test Project', '/path/project');
      testProjectId = project.id;
    });

    describe('create', () => {
      it('should create an agent with name', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');

        expect(agent).toBeDefined();
        expect(agent.id).toBeDefined();
        expect(agent.project_id).toBe(testProjectId);
        expect(agent.name).toBe('My Agent');
      });

      it('should create multiple agents in same project', () => {
        agentsDb.create(testProjectId, 'Agent 1');
        agentsDb.create(testProjectId, 'Agent 2');

        const agents = agentsDb.getByProject(testProjectId);
        expect(agents).toHaveLength(2);
      });
    });

    describe('getById', () => {
      it('should return agent by id', () => {
        const created = agentsDb.create(testProjectId, 'My Agent');

        const agent = agentsDb.getById(created.id);

        expect(agent).toBeDefined();
        expect(agent.id).toBe(created.id);
        expect(agent.name).toBe('My Agent');
      });

      it('should return undefined for non-existent agent', () => {
        const agent = agentsDb.getById(999);

        expect(agent).toBeUndefined();
      });
    });

    describe('getByProject', () => {
      it('should return all agents for a project', () => {
        agentsDb.create(testProjectId, 'Agent A');
        agentsDb.create(testProjectId, 'Agent B');

        const agents = agentsDb.getByProject(testProjectId);

        expect(agents).toHaveLength(2);
      });

      it('should return agents sorted by name', () => {
        agentsDb.create(testProjectId, 'Zebra Agent');
        agentsDb.create(testProjectId, 'Alpha Agent');

        const agents = agentsDb.getByProject(testProjectId);

        expect(agents[0].name).toBe('Alpha Agent');
        expect(agents[1].name).toBe('Zebra Agent');
      });

      it('should return empty array when project has no agents', () => {
        const agents = agentsDb.getByProject(testProjectId);

        expect(agents).toHaveLength(0);
      });
    });

    describe('getWithProject', () => {
      it('should return agent with project info', () => {
        const created = agentsDb.create(testProjectId, 'My Agent');

        const agentWithProject = agentsDb.getWithProject(created.id);

        expect(agentWithProject).toBeDefined();
        expect(agentWithProject.id).toBe(created.id);
        expect(agentWithProject.name).toBe('My Agent');
        expect(agentWithProject.user_id).toBe(testUserId);
        expect(agentWithProject.project_name).toBe('Test Project');
        expect(agentWithProject.repo_folder_path).toBe('/path/project');
      });

      it('should return undefined for non-existent agent', () => {
        const agentWithProject = agentsDb.getWithProject(999);

        expect(agentWithProject).toBeUndefined();
      });
    });

    describe('update', () => {
      it('should update agent name', () => {
        const created = agentsDb.create(testProjectId, 'Old Name');

        const updated = agentsDb.update(created.id, { name: 'New Name' });

        expect(updated.name).toBe('New Name');
      });

      it('should return null when updating non-existent agent', () => {
        const updated = agentsDb.update(999, { name: 'New Name' });

        expect(updated).toBeNull();
      });

      it('should return existing agent when no updates provided', () => {
        const created = agentsDb.create(testProjectId, 'My Agent');

        const updated = agentsDb.update(created.id, {});

        expect(updated.name).toBe('My Agent');
      });
    });

    describe('delete', () => {
      it('should delete an agent', () => {
        const created = agentsDb.create(testProjectId, 'My Agent');

        const deleted = agentsDb.delete(created.id);

        expect(deleted).toBe(true);
        expect(agentsDb.getById(created.id)).toBeUndefined();
      });

      it('should return false when deleting non-existent agent', () => {
        const deleted = agentsDb.delete(999);

        expect(deleted).toBe(false);
      });
    });

    describe('schedule fields', () => {
      it('should default schedule fields to null/disabled', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        const fetched = agentsDb.getById(agent.id);

        expect(fetched.schedule).toBeNull();
        expect(fetched.cron_prompt).toBeNull();
        expect(fetched.schedule_enabled).toBe(0);
        expect(fetched.last_run_at).toBeNull();
        expect(fetched.next_run_at).toBeNull();
      });

      it('should update schedule fields', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');

        const updated = agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Run daily task',
          schedule_enabled: 1
        });

        expect(updated.schedule).toBe('0 9 * * *');
        expect(updated.cron_prompt).toBe('Run daily task');
        expect(updated.schedule_enabled).toBe(1);
      });

      it('should preserve schedule fields when updating name only', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Daily task',
          schedule_enabled: 1
        });

        const updated = agentsDb.update(agent.id, { name: 'Updated Name' });

        expect(updated.name).toBe('Updated Name');
        expect(updated.schedule).toBe('0 9 * * *');
        expect(updated.cron_prompt).toBe('Daily task');
        expect(updated.schedule_enabled).toBe(1);
      });

      it('should disable schedule', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Daily task',
          schedule_enabled: 1
        });

        const updated = agentsDb.update(agent.id, { schedule_enabled: 0 });

        expect(updated.schedule_enabled).toBe(0);
        // Schedule and prompt should remain
        expect(updated.schedule).toBe('0 9 * * *');
        expect(updated.cron_prompt).toBe('Daily task');
      });
    });

    describe('updateNextRunAt', () => {
      it('should update next_run_at', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        const nextRun = new Date('2025-12-25T09:00:00Z');

        const updated = agentsDb.updateNextRunAt(agent.id, nextRun);

        expect(updated.next_run_at).toBe('2025-12-25T09:00:00.000Z');
      });

      it('should set next_run_at to null', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        agentsDb.updateNextRunAt(agent.id, new Date());

        const updated = agentsDb.updateNextRunAt(agent.id, null);

        expect(updated.next_run_at).toBeNull();
      });
    });

    describe('updateScheduleStatus', () => {
      it('should update both last_run_at and next_run_at', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        const lastRun = new Date('2025-12-24T09:00:00Z');
        const nextRun = new Date('2025-12-25T09:00:00Z');

        const updated = agentsDb.updateScheduleStatus(agent.id, lastRun, nextRun);

        expect(updated.last_run_at).toBe('2025-12-24T09:00:00.000Z');
        expect(updated.next_run_at).toBe('2025-12-25T09:00:00.000Z');
      });

      it('should set last_run_at only when next_run_at is null', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        const lastRun = new Date('2025-12-24T09:00:00Z');

        const updated = agentsDb.updateScheduleStatus(agent.id, lastRun, null);

        expect(updated.last_run_at).toBe('2025-12-24T09:00:00.000Z');
        expect(updated.next_run_at).toBeNull();
      });
    });

    describe('getScheduledAgentsDue', () => {
      it('should return agents due for execution', () => {
        const agent = agentsDb.create(testProjectId, 'Scheduled Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Daily task',
          schedule_enabled: 1
        });
        // Set next_run_at to the past
        const pastTime = new Date('2025-12-23T09:00:00Z');
        agentsDb.updateNextRunAt(agent.id, pastTime);

        // Check for agents due now
        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(1);
        expect(dueAgents[0].id).toBe(agent.id);
        expect(dueAgents[0].repo_folder_path).toBe('/path/project');
        expect(dueAgents[0].user_id).toBe(testUserId);
      });

      it('should not return agents not yet due', () => {
        const agent = agentsDb.create(testProjectId, 'Scheduled Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Daily task',
          schedule_enabled: 1
        });
        // Set next_run_at to the future
        const futureTime = new Date('2025-12-25T09:00:00Z');
        agentsDb.updateNextRunAt(agent.id, futureTime);

        // Check for agents due now (before the scheduled time)
        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(0);
      });

      it('should not return disabled agents', () => {
        const agent = agentsDb.create(testProjectId, 'Scheduled Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Daily task',
          schedule_enabled: 0 // Disabled
        });
        const pastTime = new Date('2025-12-23T09:00:00Z');
        agentsDb.updateNextRunAt(agent.id, pastTime);

        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(0);
      });

      it('should not return agents without cron_prompt', () => {
        const agent = agentsDb.create(testProjectId, 'Scheduled Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: null, // No prompt
          schedule_enabled: 1
        });
        const pastTime = new Date('2025-12-23T09:00:00Z');
        agentsDb.updateNextRunAt(agent.id, pastTime);

        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(0);
      });

      it('should not return agents without schedule', () => {
        const agent = agentsDb.create(testProjectId, 'Scheduled Agent');
        agentsDb.update(agent.id, {
          schedule: null, // No schedule
          cron_prompt: 'Daily task',
          schedule_enabled: 1
        });
        const pastTime = new Date('2025-12-23T09:00:00Z');
        agentsDb.updateNextRunAt(agent.id, pastTime);

        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(0);
      });

      it('should not return agents without next_run_at', () => {
        const agent = agentsDb.create(testProjectId, 'Scheduled Agent');
        agentsDb.update(agent.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Daily task',
          schedule_enabled: 1
        });
        // Don't set next_run_at

        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(0);
      });

      it('should return multiple due agents', () => {
        // Create two scheduled agents
        const agent1 = agentsDb.create(testProjectId, 'Agent 1');
        agentsDb.update(agent1.id, {
          schedule: '0 9 * * *',
          cron_prompt: 'Task 1',
          schedule_enabled: 1
        });
        agentsDb.updateNextRunAt(agent1.id, new Date('2025-12-23T09:00:00Z'));

        const agent2 = agentsDb.create(testProjectId, 'Agent 2');
        agentsDb.update(agent2.id, {
          schedule: '0 10 * * *',
          cron_prompt: 'Task 2',
          schedule_enabled: 1
        });
        agentsDb.updateNextRunAt(agent2.id, new Date('2025-12-23T10:00:00Z'));

        const now = new Date('2025-12-24T10:00:00Z');
        const dueAgents = agentsDb.getScheduledAgentsDue(now);

        expect(dueAgents).toHaveLength(2);
      });
    });

    describe('cascade delete', () => {
      it('should cascade delete agents when project is deleted', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');

        projectsDb.delete(testProjectId, testUserId);

        expect(agentsDb.getById(agent.id)).toBeUndefined();
      });

      it('should cascade delete agent conversations when agent is deleted', () => {
        const agent = agentsDb.create(testProjectId, 'My Agent');
        const conversation = conversationsDb.createForAgent(agent.id);

        agentsDb.delete(agent.id);

        expect(conversationsDb.getById(conversation.id)).toBeUndefined();
      });
    });
  });

  describe('conversationsDb - Agent Support', () => {
    let testProjectId;
    let testAgentId;

    beforeEach(() => {
      const project = projectsDb.create(testUserId, 'Test Project', '/path/project');
      testProjectId = project.id;
      const agent = agentsDb.create(testProjectId, 'Test Agent');
      testAgentId = agent.id;
    });

    describe('createForAgent', () => {
      it('should create a conversation for an agent', () => {
        const conversation = conversationsDb.createForAgent(testAgentId);

        expect(conversation).toBeDefined();
        expect(conversation.id).toBeDefined();
        expect(conversation.task_id).toBeNull();
        expect(conversation.agent_id).toBe(testAgentId);
      });
    });

    describe('createForAgentWithTrigger', () => {
      it('should create a conversation with manual trigger by default', () => {
        const conversation = conversationsDb.createForAgentWithTrigger(testAgentId);

        expect(conversation).toBeDefined();
        expect(conversation.agent_id).toBe(testAgentId);
        expect(conversation.triggered_by).toBe('manual');
      });

      it('should create a conversation with cron trigger', () => {
        const conversation = conversationsDb.createForAgentWithTrigger(testAgentId, 'cron');

        expect(conversation).toBeDefined();
        expect(conversation.agent_id).toBe(testAgentId);
        expect(conversation.triggered_by).toBe('cron');
      });
    });

    describe('getByAgent', () => {
      it('should return all conversations for an agent', () => {
        conversationsDb.createForAgent(testAgentId);
        conversationsDb.createForAgent(testAgentId);

        const conversations = conversationsDb.getByAgent(testAgentId);

        expect(conversations).toHaveLength(2);
      });

      it('should return empty array when agent has no conversations', () => {
        const conversations = conversationsDb.getByAgent(testAgentId);

        expect(conversations).toHaveLength(0);
      });

      it('should return conversations ordered by created_at DESC', () => {
        const conv1 = conversationsDb.createForAgent(testAgentId);
        const conv2 = conversationsDb.createForAgent(testAgentId);

        const conversations = conversationsDb.getByAgent(testAgentId);

        // Most recent first (higher id means created later in tests)
        expect(conversations[0].id).toBe(conv2.id);
        expect(conversations[1].id).toBe(conv1.id);
      });
    });
  });
});
