/**
 * BoardTaskCard.jsx - Task Card for Board Columns
 *
 * Compact task card displayed within Kanban board columns.
 * Shows task title, conversation count, documentation preview,
 * and LIVE indicator for active streaming.
 */

import React, { useMemo } from 'react';
import { MessageSquare, FileText, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Extract plain text preview from markdown documentation
 */
function extractPreview(markdown, maxLength = 60) {
  if (!markdown) return '';

  let text = markdown
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove images
    .replace(/!\[.*?\]\(.*?\)/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Collapse whitespace
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    text = text.substring(0, maxLength).trim() + '...';
  }

  return text;
}

function BoardTaskCard({
  task,
  isLive = false,
  conversationCount = 0,
  docPreview = '',
  onClick,
  onEditClick
}) {
  // Extract preview text from documentation
  const preview = useMemo(() => extractPreview(docPreview), [docPreview]);

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEditClick?.(task);
  };

  return (
    <div
      data-testid={`board-task-card-${task.id}`}
      onClick={() => onClick?.(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(task);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative p-3 rounded-lg border transition-all duration-150',
        'bg-gradient-to-br from-card to-card/80',
        'hover:from-accent/30 hover:to-accent/50',
        'cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'shadow-sm hover:shadow-md',
        // Micro-interaction: subtle scale on hover
        'hover:scale-[1.02] active:scale-[0.98]',
        'transform-gpu',
        isLive
          ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
          : 'border-border hover:border-primary/30'
      )}
    >
      {/* LIVE indicator */}
      {isLive && (
        <div className="absolute top-2 right-2">
          <span className="flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        </div>
      )}

      {/* Task title */}
      <h4 className={cn(
        'font-semibold text-sm text-foreground leading-tight',
        'line-clamp-2',
        isLive && 'pr-5' // Make room for LIVE indicator
      )}>
        {task.title || `Task ${task.id}`}
      </h4>

      {/* Meta row: conversation count + doc preview */}
      <div className="mt-2 flex flex-col gap-1.5">
        {/* Conversation count */}
        {conversationCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            <span>{conversationCount} conversation{conversationCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Documentation preview */}
        {preview && (
          <div className="flex items-start gap-1.5">
            <FileText className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground line-clamp-1">
              {preview}
            </p>
          </div>
        )}
      </div>

      {/* Edit button - appears on hover */}
      <button
        type="button"
        onClick={handleEditClick}
        className={cn(
          'absolute bottom-2 right-2',
          'opacity-0 group-hover:opacity-100',
          'p-1.5 rounded-md transition-all',
          'text-muted-foreground hover:text-primary',
          'hover:bg-primary/10',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        title="Edit task"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default BoardTaskCard;
