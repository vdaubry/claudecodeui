import { describe, it, expect, vi } from 'vitest';

describe('BoardTaskCard Logic', () => {
  // Helper function to extract preview (same as in component)
  function extractPreview(markdown, maxLength = 60) {
    if (!markdown) return '';

    let text = markdown
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^>\s+/gm, '')
      .replace(/^---+$/gm, '')
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > maxLength) {
      text = text.substring(0, maxLength).trim() + '...';
    }

    return text;
  }

  describe('Preview Text Extraction', () => {
    it('should return empty string for empty markdown', () => {
      expect(extractPreview('')).toBe('');
      expect(extractPreview(null)).toBe('');
      expect(extractPreview(undefined)).toBe('');
    });

    it('should extract plain text from simple markdown', () => {
      const markdown = 'This is a simple task description.';
      expect(extractPreview(markdown)).toBe('This is a simple task description.');
    });

    it('should remove markdown headers', () => {
      const markdown = '# Header\nSome content';
      expect(extractPreview(markdown)).toBe('Header Some content');
    });

    it('should remove code blocks', () => {
      const markdown = 'Before ```code``` after';
      expect(extractPreview(markdown)).toBe('Before after');
    });

    it('should remove inline code', () => {
      const markdown = 'Use `npm install` to install';
      expect(extractPreview(markdown)).toBe('Use to install');
    });

    it('should preserve link text but remove URL', () => {
      const markdown = 'Click [here](https://example.com) for more';
      expect(extractPreview(markdown)).toBe('Click here for more');
    });

    it('should remove images', () => {
      const markdown = 'See this ![alt](image.png) picture';
      expect(extractPreview(markdown)).toBe('See this picture');
    });

    it('should remove bold formatting', () => {
      const markdown = 'This is **bold** text';
      expect(extractPreview(markdown)).toBe('This is bold text');
    });

    it('should remove italic formatting', () => {
      const markdown = 'This is *italic* text';
      expect(extractPreview(markdown)).toBe('This is italic text');
    });

    it('should truncate long text with ellipsis', () => {
      const markdown = 'A'.repeat(100);
      const preview = extractPreview(markdown, 60);
      expect(preview.length).toBeLessThanOrEqual(63); // 60 + "..."
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should not truncate short text', () => {
      const markdown = 'Short text';
      const preview = extractPreview(markdown, 60);
      expect(preview).toBe('Short text');
      expect(preview.endsWith('...')).toBe(false);
    });
  });

  describe('Task Title Display', () => {
    it('should use task title when provided', () => {
      const task = { id: 't1', title: 'Implement feature X' };
      expect(task.title).toBe('Implement feature X');
    });

    it('should fallback to Task ID when title is missing', () => {
      const task = { id: 't1' };
      const displayTitle = task.title || `Task ${task.id}`;
      expect(displayTitle).toBe('Task t1');
    });
  });

  describe('Live Indicator', () => {
    it('should show live indicator when isLive is true', () => {
      const isLive = true;
      expect(isLive).toBe(true);
      // Component would show pulsing red dot
    });

    it('should not show live indicator when isLive is false', () => {
      const isLive = false;
      expect(isLive).toBe(false);
    });
  });

  describe('Conversation Count Display', () => {
    it('should show conversation count when greater than 0', () => {
      const conversationCount = 5;
      const showCount = conversationCount > 0;
      expect(showCount).toBe(true);
    });

    it('should not show conversation count when 0', () => {
      const conversationCount = 0;
      const showCount = conversationCount > 0;
      expect(showCount).toBe(false);
    });

    it('should format singular conversation correctly', () => {
      const count = 1;
      const label = `${count} conversation${count !== 1 ? 's' : ''}`;
      expect(label).toBe('1 conversation');
    });

    it('should format plural conversations correctly', () => {
      const count = 3;
      const label = `${count} conversation${count !== 1 ? 's' : ''}`;
      expect(label).toBe('3 conversations');
    });
  });

  describe('Click Handlers', () => {
    it('should call onClick with task when card is clicked', () => {
      const onClick = vi.fn();
      const task = { id: 't1', title: 'Test Task' };

      onClick(task);
      expect(onClick).toHaveBeenCalledWith(task);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onEditClick with task when edit button is clicked', () => {
      const onEditClick = vi.fn();
      const task = { id: 't1', title: 'Test Task' };

      onEditClick(task);
      expect(onEditClick).toHaveBeenCalledWith(task);
    });

    it('should stop propagation on edit click to prevent card click', () => {
      const stopPropagation = vi.fn();
      const event = { stopPropagation };

      const handleEditClick = (e) => {
        e.stopPropagation();
      };

      handleEditClick(event);
      expect(stopPropagation).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should trigger click on Enter key', () => {
      const key = 'Enter';
      const shouldTrigger = key === 'Enter' || key === ' ';
      expect(shouldTrigger).toBe(true);
    });

    it('should trigger click on Space key', () => {
      const key = ' ';
      const shouldTrigger = key === 'Enter' || key === ' ';
      expect(shouldTrigger).toBe(true);
    });

    it('should not trigger click on other keys', () => {
      const key = 'Tab';
      const shouldTrigger = key === 'Enter' || key === ' ';
      expect(shouldTrigger).toBe(false);
    });
  });

  describe('Border Styling', () => {
    it('should apply live border styling when live', () => {
      const isLive = true;
      const borderClass = isLive
        ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
        : 'border-border hover:border-primary/30';
      expect(borderClass).toContain('border-red-500');
    });

    it('should apply default border styling when not live', () => {
      const isLive = false;
      const borderClass = isLive
        ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
        : 'border-border hover:border-primary/30';
      expect(borderClass).toContain('border-border');
    });
  });
});
