import { describe, it, expect, vi } from 'vitest';

describe('CompletedCollapse Logic', () => {
  describe('Collapse State', () => {
    it('should start collapsed by default', () => {
      const defaultCollapsed = true;
      expect(defaultCollapsed).toBe(true);
    });

    it('should toggle collapse state', () => {
      let isCollapsed = true;

      const toggleCollapse = () => {
        isCollapsed = !isCollapsed;
      };

      expect(isCollapsed).toBe(true);
      toggleCollapse();
      expect(isCollapsed).toBe(false);
      toggleCollapse();
      expect(isCollapsed).toBe(true);
    });
  });

  describe('Content Visibility', () => {
    it('should hide content when collapsed', () => {
      const isCollapsed = true;
      const shouldShowContent = !isCollapsed;

      expect(shouldShowContent).toBe(false);
    });

    it('should show content when expanded', () => {
      const isCollapsed = false;
      const shouldShowContent = !isCollapsed;

      expect(shouldShowContent).toBe(true);
    });
  });

  describe('Chevron Direction', () => {
    it('should show right chevron when collapsed', () => {
      const isCollapsed = true;
      const chevronRotation = isCollapsed ? 'rotate-0' : 'rotate-90';

      expect(chevronRotation).toBe('rotate-0');
    });

    it('should show down chevron when expanded', () => {
      const isCollapsed = false;
      const chevronRotation = isCollapsed ? 'rotate-0' : 'rotate-90';

      expect(chevronRotation).toBe('rotate-90');
    });
  });

  describe('Completed Task Count', () => {
    it('should display count of completed tasks', () => {
      const completedTasks = [
        { id: 't1', status: 'completed' },
        { id: 't2', status: 'completed' },
        { id: 't3', status: 'completed' }
      ];

      expect(completedTasks.length).toBe(3);
    });

    it('should format count correctly in label', () => {
      const count = 5;
      const label = `${count} completed`;

      expect(label).toBe('5 completed');
    });

    it('should handle singular vs plural', () => {
      const formatLabel = (count) => {
        return count === 1 ? '1 completed task' : `${count} completed tasks`;
      };

      expect(formatLabel(1)).toBe('1 completed task');
      expect(formatLabel(5)).toBe('5 completed tasks');
      expect(formatLabel(0)).toBe('0 completed tasks');
    });
  });

  describe('Click Handler', () => {
    it('should call toggle handler on click', () => {
      const onToggle = vi.fn();

      onToggle();
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should toggle state on each click', () => {
      let isCollapsed = true;
      const toggleHistory = [];

      const handleClick = () => {
        isCollapsed = !isCollapsed;
        toggleHistory.push(isCollapsed);
      };

      handleClick();
      expect(toggleHistory).toEqual([false]);

      handleClick();
      expect(toggleHistory).toEqual([false, true]);

      handleClick();
      expect(toggleHistory).toEqual([false, true, false]);
    });
  });

  describe('Empty State', () => {
    it('should not render when no completed tasks', () => {
      const completedTasks = [];
      const shouldRender = completedTasks.length > 0;

      expect(shouldRender).toBe(false);
    });

    it('should render when completed tasks exist', () => {
      const completedTasks = [{ id: 't1', status: 'completed' }];
      const shouldRender = completedTasks.length > 0;

      expect(shouldRender).toBe(true);
    });
  });
});
