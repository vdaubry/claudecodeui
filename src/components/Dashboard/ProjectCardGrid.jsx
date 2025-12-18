/**
 * ProjectCardGrid.jsx - Grid-Style Project Card
 *
 * Modern card component for the dashboard grid layout.
 * Shows project name, status badges, documentation preview,
 * and action buttons.
 */

import React, { useState, useMemo } from 'react';
import {
  Folder,
  Pencil,
  Trash2,
  FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import StatusBadge from './StatusBadge';

/**
 * Extract plain text from markdown content
 * Strips headers, links, images, code blocks, and formatting
 */
function extractPlainText(markdown, maxLength = 120) {
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

function ProjectCardGrid({
  project,
  taskCounts = { pending: 0, in_progress: 0, completed: 0 },
  documentationPreview = '',
  hasLiveTask = false,
  onCardClick,
  onEditClick,
  onDeleteClick,
  onStatusBadgeClick
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Extract plain text preview from documentation
  const docPreview = useMemo(() => {
    return extractPlainText(documentationPreview);
  }, [documentationPreview]);

  const totalTasks = taskCounts.pending + taskCounts.in_progress + taskCounts.completed;
  const hasTasks = totalTasks > 0;

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? All tasks and conversations will be lost.')) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDeleteClick?.(project.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEditClick?.();
  };

  return (
    <div
      data-testid={`project-card-grid-${project.name.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={onCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-200',
        'bg-gradient-to-br from-card to-card/80',
        'hover:shadow-lg hover:shadow-primary/5',
        'hover:border-primary/30',
        'cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        hasLiveTask
          ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
          : 'border-border'
      )}
    >
      {/* Live indicator */}
      {hasLiveTask && (
        <div className="absolute top-3 right-3">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
        </div>
      )}

      {/* Header: Icon and Name */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
          'bg-primary/10 text-primary',
          'group-hover:bg-primary/15 transition-colors'
        )}>
          <Folder className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="font-semibold text-foreground truncate text-base leading-tight">
            {project.name}
          </h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {project.repo_folder_path}
          </p>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        <StatusBadge
          status="pending"
          count={taskCounts.pending}
          onClick={onStatusBadgeClick}
        />
        <StatusBadge
          status="in_progress"
          count={taskCounts.in_progress}
          onClick={onStatusBadgeClick}
        />
        <StatusBadge
          status="completed"
          count={taskCounts.completed}
          onClick={onStatusBadgeClick}
        />
        {!hasTasks && (
          <span className="text-xs text-muted-foreground italic">No tasks yet</span>
        )}
      </div>

      {/* Documentation Preview */}
      {docPreview && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <FileText className="w-3 h-3" />
            <span>Documentation</span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {docPreview}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-1 pt-2 border-t border-border/50">
        <button
          type="button"
          className={cn(
            'p-2 rounded-lg text-muted-foreground transition-colors',
            'hover:text-primary hover:bg-primary/10',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          onClick={handleEdit}
          title="Edit project"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={cn(
            'p-2 rounded-lg text-muted-foreground transition-colors',
            'hover:text-red-500 hover:bg-red-500/10',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete project"
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export default ProjectCardGrid;
