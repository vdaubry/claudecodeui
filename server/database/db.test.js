import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../test/db-helper.js';

describe('Database Layer - Phase 1', () => {
  let testDb;
  let userDb, projectsDb, tasksDb, conversationsDb;
  let testUserId;

  beforeEach(() => {
    testDb = createTestDatabase();
    userDb = testDb.userDb;
    projectsDb = testDb.projectsDb;
    tasksDb = testDb.tasksDb;
    conversationsDb = testDb.conversationsDb;

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
});
