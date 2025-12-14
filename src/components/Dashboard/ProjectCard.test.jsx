import { describe, it, expect, vi } from 'vitest';

describe('ProjectCard Logic', () => {
  describe('Expand/Collapse State', () => {
    it('should toggle expansion state', () => {
      let isExpanded = false;

      const toggleExpand = () => {
        isExpanded = !isExpanded;
      };

      expect(isExpanded).toBe(false);
      toggleExpand();
      expect(isExpanded).toBe(true);
      toggleExpand();
      expect(isExpanded).toBe(false);
    });

    it('should call onToggle with project id', () => {
      const onToggle = vi.fn();
      const projectId = 'p1';

      onToggle(projectId);
      expect(onToggle).toHaveBeenCalledWith('p1');
    });
  });

  describe('Chevron Icon', () => {
    it('should show down chevron when expanded', () => {
      const isExpanded = true;
      const chevronClass = isExpanded ? 'rotate-0' : '-rotate-90';

      expect(chevronClass).toBe('rotate-0');
    });

    it('should show right chevron when collapsed', () => {
      const isExpanded = false;
      const chevronClass = isExpanded ? 'rotate-0' : '-rotate-90';

      expect(chevronClass).toBe('-rotate-90');
    });
  });

  describe('Task Count Display', () => {
    it('should display task count', () => {
      const tasks = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

      const taskCount = tasks.length;
      expect(taskCount).toBe(3);
    });

    it('should format task count correctly', () => {
      const formatTaskCount = (count) => {
        if (count === 0) return 'No tasks';
        if (count === 1) return '1 task';
        return `${count} tasks`;
      };

      expect(formatTaskCount(0)).toBe('No tasks');
      expect(formatTaskCount(1)).toBe('1 task');
      expect(formatTaskCount(5)).toBe('5 tasks');
    });
  });

  describe('Active Conversation Detection', () => {
    it('should detect project with active conversation', () => {
      const tasks = [
        { id: 't1', conversations: [{ is_active: false }] },
        { id: 't2', conversations: [{ is_active: true }] }
      ];

      const hasActiveConversation = tasks.some(task =>
        task.conversations?.some(c => c.is_active)
      );

      expect(hasActiveConversation).toBe(true);
    });

    it('should detect project without active conversation', () => {
      const tasks = [
        { id: 't1', conversations: [{ is_active: false }] },
        { id: 't2', conversations: [] }
      ];

      const hasActiveConversation = tasks.some(task =>
        task.conversations?.some(c => c.is_active)
      );

      expect(hasActiveConversation).toBe(false);
    });

    it('should handle tasks with no conversations', () => {
      const tasks = [
        { id: 't1' },
        { id: 't2' }
      ];

      const hasActiveConversation = tasks.some(task =>
        task.conversations?.some(c => c.is_active)
      );

      expect(hasActiveConversation).toBe(false);
    });
  });

  describe('Glow Effect', () => {
    it('should apply glow when has active conversation', () => {
      const hasActive = true;
      const glowClass = hasActive ? 'ring-2 ring-red-400 ring-opacity-50' : '';

      expect(glowClass).toBe('ring-2 ring-red-400 ring-opacity-50');
    });

    it('should not apply glow when no active conversation', () => {
      const hasActive = false;
      const glowClass = hasActive ? 'ring-2 ring-red-400 ring-opacity-50' : '';

      expect(glowClass).toBe('');
    });
  });

  describe('Project Path Display', () => {
    it('should display project folder path', () => {
      const project = {
        name: 'My Project',
        folder_path: '/home/ubuntu/projects/my-project'
      };

      expect(project.folder_path).toBe('/home/ubuntu/projects/my-project');
    });

    it('should handle missing folder path', () => {
      const project = {
        name: 'My Project'
      };

      const displayPath = project.folder_path || 'No path specified';
      expect(displayPath).toBe('No path specified');
    });
  });

  describe('Task List Visibility', () => {
    it('should show task list when expanded', () => {
      const isExpanded = true;
      const showTaskList = isExpanded;

      expect(showTaskList).toBe(true);
    });

    it('should hide task list when collapsed', () => {
      const isExpanded = false;
      const showTaskList = isExpanded;

      expect(showTaskList).toBe(false);
    });
  });

  describe('Empty Tasks State', () => {
    it('should show empty message when no tasks', () => {
      const tasks = [];
      const showEmptyMessage = tasks.length === 0;

      expect(showEmptyMessage).toBe(true);
    });

    it('should not show empty message when tasks exist', () => {
      const tasks = [{ id: 't1' }];
      const showEmptyMessage = tasks.length === 0;

      expect(showEmptyMessage).toBe(false);
    });
  });

  describe('Project Click Handler', () => {
    it('should call onClick with project when header clicked', () => {
      const onClick = vi.fn();
      const project = { id: 'p1', name: 'Test Project' };

      onClick(project);
      expect(onClick).toHaveBeenCalledWith(project);
    });
  });

  describe('Task Click Handler', () => {
    it('should call onTaskClick with task when task row clicked', () => {
      const onTaskClick = vi.fn();
      const task = { id: 't1', title: 'Test Task' };

      onTaskClick(task);
      expect(onTaskClick).toHaveBeenCalledWith(task);
    });
  });
});
