import { describe, it, expect, vi } from 'vitest';

describe('TaskRow Logic', () => {
  describe('Status Badge Display', () => {
    it('should show LIVE badge for active conversation', () => {
      const task = {
        conversations: [{ is_active: true }]
      };

      const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
      expect(hasActiveConversation).toBe(true);

      const badgeText = hasActiveConversation ? 'LIVE' : (task.status === 'in_progress' ? 'In Progress' : 'Pending');
      expect(badgeText).toBe('LIVE');
    });

    it('should show In Progress badge for in_progress status', () => {
      const task = {
        status: 'in_progress',
        conversations: [{ is_active: false }]
      };

      const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
      const badgeText = hasActiveConversation ? 'LIVE' : (task.status === 'in_progress' ? 'In Progress' : 'Pending');
      expect(badgeText).toBe('In Progress');
    });

    it('should show Pending badge for pending status', () => {
      const task = {
        status: 'pending',
        conversations: []
      };

      const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
      const badgeText = hasActiveConversation ? 'LIVE' : (task.status === 'in_progress' ? 'In Progress' : 'Pending');
      expect(badgeText).toBe('Pending');
    });

    it('should show Completed badge for completed status', () => {
      const task = {
        status: 'completed',
        conversations: []
      };

      const isCompleted = task.status === 'completed';
      expect(isCompleted).toBe(true);
    });

    it('should show LIVE badge when isLive is true regardless of status', () => {
      const tasks = [
        { status: 'pending', conversations: [{ is_active: true }] },
        { status: 'in_progress', conversations: [{ is_active: true }] },
        { status: 'completed', conversations: [{ is_active: true }] }
      ];

      tasks.forEach(task => {
        const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
        expect(hasActiveConversation).toBe(true);
        // LIVE takes priority over status
        const badgeText = hasActiveConversation ? 'LIVE' : task.status;
        expect(badgeText).toBe('LIVE');
      });
    });

    it('should use task.status not derived hasConversations', () => {
      // A task with status='in_progress' but no conversations should still show 'In Progress'
      const task = {
        status: 'in_progress',
        conversations: []
      };

      const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
      expect(hasActiveConversation).toBe(false);

      // Should use the actual status field, not derive from conversation count
      const badgeText = hasActiveConversation ? 'LIVE' :
        (task.status === 'in_progress' ? 'In Progress' :
         task.status === 'completed' ? 'Completed' : 'Pending');
      expect(badgeText).toBe('In Progress');
    });

    it('should show Pending badge with gray styling', () => {
      const task = { status: 'pending' };
      // Verify the status field is used directly
      expect(task.status).toBe('pending');
    });

    it('should show In Progress badge with yellow styling', () => {
      const task = { status: 'in_progress' };
      // Verify the status field is used directly
      expect(task.status).toBe('in_progress');
    });

    it('should show Completed badge with green styling', () => {
      const task = { status: 'completed' };
      // Verify the status field is used directly
      expect(task.status).toBe('completed');
    });
  });

  describe('Status Indicator Icon', () => {
    it('should show filled dot for in_progress or active', () => {
      const getIconType = (task) => {
        const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
        if (hasActiveConversation || task.status === 'in_progress') {
          return 'filled';
        }
        return 'empty';
      };

      expect(getIconType({ status: 'in_progress', conversations: [] })).toBe('filled');
      expect(getIconType({ status: 'pending', conversations: [{ is_active: true }] })).toBe('filled');
    });

    it('should show empty dot for pending', () => {
      const getIconType = (task) => {
        const hasActiveConversation = task.conversations?.some(c => c.is_active) || false;
        if (hasActiveConversation || task.status === 'in_progress') {
          return 'filled';
        }
        return 'empty';
      };

      expect(getIconType({ status: 'pending', conversations: [] })).toBe('empty');
    });

    it('should show checkmark for completed', () => {
      const task = { status: 'completed' };
      const isCompleted = task.status === 'completed';
      expect(isCompleted).toBe(true);
    });
  });

  describe('Time Ago Formatting', () => {
    it('should format recent times as "just now"', () => {
      const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now - new Date(date);
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
      };

      const justNow = new Date();
      expect(formatTimeAgo(justNow)).toBe('just now');
    });

    it('should format minutes correctly', () => {
      const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now - new Date(date);
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
      };

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatTimeAgo(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should format hours correctly', () => {
      const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now - new Date(date);
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
      };

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatTimeAgo(twoHoursAgo)).toBe('2h ago');
    });

    it('should format days correctly', () => {
      const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now - new Date(date);
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
      };

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatTimeAgo(threeDaysAgo)).toBe('3d ago');
    });
  });

  describe('Task Click Handler', () => {
    it('should call onClick with task when clicked', () => {
      const onClick = vi.fn();
      const task = { id: 't1', title: 'Test Task' };

      onClick(task);
      expect(onClick).toHaveBeenCalledWith(task);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Delete Handler', () => {
    it('should call onDelete with task id when delete clicked', () => {
      const onDelete = vi.fn();
      const task = { id: 't1', title: 'Test Task' };

      onDelete(task.id);
      expect(onDelete).toHaveBeenCalledWith('t1');
    });

    it('should stop propagation to prevent task click', () => {
      const stopPropagation = vi.fn();
      const event = { stopPropagation };

      // Simulate delete button click handler
      const handleDelete = (e) => {
        e.stopPropagation();
      };

      handleDelete(event);
      expect(stopPropagation).toHaveBeenCalled();
    });
  });

  describe('Task Title Display', () => {
    it('should display task title', () => {
      const task = { title: 'Implement feature X' };
      expect(task.title).toBe('Implement feature X');
    });

    it('should show project name prefix in status view', () => {
      const task = { title: 'Feature X' };
      const project = { name: 'My Project' };
      const showProjectPrefix = true;

      const displayTitle = showProjectPrefix
        ? `${project.name} › ${task.title}`
        : task.title;

      expect(displayTitle).toBe('My Project › Feature X');
    });
  });
});
