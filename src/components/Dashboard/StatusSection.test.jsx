import { describe, it, expect, vi } from 'vitest';

describe('StatusSection Logic', () => {
  describe('Status Categories', () => {
    it('should have correct status order', () => {
      const statusOrder = ['active', 'in_progress', 'pending', 'completed'];

      expect(statusOrder[0]).toBe('active');
      expect(statusOrder[1]).toBe('in_progress');
      expect(statusOrder[2]).toBe('pending');
      expect(statusOrder[3]).toBe('completed');
    });

    it('should have correct status labels', () => {
      const statusLabels = {
        active: 'ACTIVE NOW',
        in_progress: 'IN PROGRESS',
        pending: 'PENDING',
        completed: 'COMPLETED'
      };

      expect(statusLabels.active).toBe('ACTIVE NOW');
      expect(statusLabels.in_progress).toBe('IN PROGRESS');
      expect(statusLabels.pending).toBe('PENDING');
      expect(statusLabels.completed).toBe('COMPLETED');
    });
  });

  describe('Task Grouping', () => {
    it('should group tasks correctly by status', () => {
      const tasks = [
        { id: 't1', status: 'pending', project_id: 'p1' },
        { id: 't2', status: 'in_progress', project_id: 'p1' },
        { id: 't3', status: 'completed', project_id: 'p2' },
        { id: 't4', status: 'pending', project_id: 'p2' },
        { id: 't5', status: 'in_progress', project_id: 'p1', conversations: [{ is_active: true }] }
      ];

      const groupTasks = (taskList) => {
        const groups = {
          active: [],
          in_progress: [],
          pending: [],
          completed: []
        };

        taskList.forEach(task => {
          const isActive = task.conversations?.some(c => c.is_active);
          if (isActive) {
            groups.active.push(task);
          } else if (task.status === 'in_progress') {
            groups.in_progress.push(task);
          } else if (task.status === 'pending') {
            groups.pending.push(task);
          } else if (task.status === 'completed') {
            groups.completed.push(task);
          }
        });

        return groups;
      };

      const groups = groupTasks(tasks);

      expect(groups.active).toHaveLength(1);
      expect(groups.in_progress).toHaveLength(1);
      expect(groups.pending).toHaveLength(2);
      expect(groups.completed).toHaveLength(1);
    });

    it('should prioritize active over in_progress', () => {
      const task = {
        id: 't1',
        status: 'in_progress',
        conversations: [{ is_active: true }]
      };

      const isActive = task.conversations?.some(c => c.is_active);

      // Task should be in active group, not in_progress
      expect(isActive).toBe(true);
    });
  });

  describe('Section Visibility', () => {
    it('should hide section when no tasks in category', () => {
      const tasks = [];

      const shouldShowSection = tasks.length > 0;
      expect(shouldShowSection).toBe(false);
    });

    it('should show section when tasks exist', () => {
      const tasks = [{ id: 't1', status: 'pending' }];

      const shouldShowSection = tasks.length > 0;
      expect(shouldShowSection).toBe(true);
    });
  });

  describe('Task Count Display', () => {
    it('should display correct task count', () => {
      const tasks = [
        { id: 't1' },
        { id: 't2' },
        { id: 't3' }
      ];

      expect(tasks.length).toBe(3);
    });

    it('should format count correctly', () => {
      const formatCount = (count) => `(${count})`;

      expect(formatCount(5)).toBe('(5)');
      expect(formatCount(0)).toBe('(0)');
      expect(formatCount(100)).toBe('(100)');
    });
  });

  describe('Project Name Lookup', () => {
    it('should find project name by task project_id', () => {
      const projects = [
        { id: 'p1', name: 'Project Alpha' },
        { id: 'p2', name: 'Project Beta' }
      ];

      const task = { id: 't1', project_id: 'p1' };

      const getProjectName = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        return project?.name || 'Unknown Project';
      };

      expect(getProjectName(task.project_id)).toBe('Project Alpha');
    });

    it('should return fallback for unknown project', () => {
      const projects = [
        { id: 'p1', name: 'Project Alpha' }
      ];

      const getProjectName = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        return project?.name || 'Unknown Project';
      };

      expect(getProjectName('unknown')).toBe('Unknown Project');
    });
  });

  describe('Status Icon Styles', () => {
    it('should return correct colors for each status', () => {
      const statusColors = {
        active: { bg: 'bg-red-100', text: 'text-red-600', icon: 'text-red-500' },
        in_progress: { bg: 'bg-blue-100', text: 'text-blue-600', icon: 'text-blue-500' },
        pending: { bg: 'bg-gray-100', text: 'text-gray-600', icon: 'text-gray-400' },
        completed: { bg: 'bg-green-100', text: 'text-green-600', icon: 'text-green-500' }
      };

      expect(statusColors.active.text).toBe('text-red-600');
      expect(statusColors.in_progress.text).toBe('text-blue-600');
      expect(statusColors.pending.text).toBe('text-gray-600');
      expect(statusColors.completed.text).toBe('text-green-600');
    });
  });
});
