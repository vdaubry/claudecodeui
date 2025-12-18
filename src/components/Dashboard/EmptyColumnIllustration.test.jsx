import { describe, it, expect } from 'vitest';

describe('EmptyColumnIllustration Logic', () => {
  // Illustration configuration
  const illustrations = {
    pending: {
      title: 'No pending tasks',
      subtitle: 'All clear! Add new tasks to get started.'
    },
    in_progress: {
      title: 'No tasks in progress',
      subtitle: 'Pick a task to start working on.'
    },
    completed: {
      title: 'No completed tasks',
      subtitle: 'Finished tasks will appear here.'
    }
  };

  describe('Status-Based Illustration Selection', () => {
    it('should select pending illustration for pending status', () => {
      const status = 'pending';
      const illustration = illustrations[status] || illustrations.pending;

      expect(illustration.title).toBe('No pending tasks');
      expect(illustration.subtitle).toBe('All clear! Add new tasks to get started.');
    });

    it('should select in_progress illustration for in_progress status', () => {
      const status = 'in_progress';
      const illustration = illustrations[status] || illustrations.pending;

      expect(illustration.title).toBe('No tasks in progress');
      expect(illustration.subtitle).toBe('Pick a task to start working on.');
    });

    it('should select completed illustration for completed status', () => {
      const status = 'completed';
      const illustration = illustrations[status] || illustrations.pending;

      expect(illustration.title).toBe('No completed tasks');
      expect(illustration.subtitle).toBe('Finished tasks will appear here.');
    });

    it('should fallback to pending illustration for unknown status', () => {
      const status = 'unknown_status';
      const illustration = illustrations[status] || illustrations.pending;

      expect(illustration.title).toBe('No pending tasks');
    });

    it('should fallback to pending illustration for undefined status', () => {
      const status = undefined;
      const illustration = illustrations[status] || illustrations.pending;

      expect(illustration.title).toBe('No pending tasks');
    });
  });

  describe('Illustration Content', () => {
    it('should have title and subtitle for each status', () => {
      Object.values(illustrations).forEach((illustration) => {
        expect(illustration.title).toBeDefined();
        expect(illustration.subtitle).toBeDefined();
        expect(typeof illustration.title).toBe('string');
        expect(typeof illustration.subtitle).toBe('string');
        expect(illustration.title.length).toBeGreaterThan(0);
        expect(illustration.subtitle.length).toBeGreaterThan(0);
      });
    });

    it('should have unique titles for each status', () => {
      const titles = Object.values(illustrations).map((i) => i.title);
      const uniqueTitles = new Set(titles);

      expect(uniqueTitles.size).toBe(titles.length);
    });
  });
});
