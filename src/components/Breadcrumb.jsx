/**
 * Breadcrumb.jsx - Navigation Breadcrumb Component
 *
 * Displays a clickable navigation path for the task-driven workflow.
 * Shows: Project > Task > Conversation (when applicable)
 * Also supports: Project > Agent > Conversation
 */

import React from 'react';
import { ChevronRight, Home, FolderOpen, FileText, MessageSquare, Bot } from 'lucide-react';
import { cn } from '../lib/utils';

function Breadcrumb({
  project,
  task,
  agent, // NEW: Support for agent breadcrumb
  conversation,
  onProjectClick,
  onTaskClick,
  onAgentClick, // NEW: Callback for agent click
  onHomeClick,
  className
}) {
  const items = [];

  // Home/Projects link (always present)
  items.push({
    key: 'home',
    label: 'Projects',
    icon: Home,
    onClick: onHomeClick,
    isClickable: true
  });

  // Project (if selected)
  if (project) {
    items.push({
      key: 'project',
      label: project.name,
      icon: FolderOpen,
      onClick: onProjectClick,
      isClickable: !!task || !!agent || !!conversation // Only clickable if we're deeper in navigation
    });
  }

  // Task (if selected) - mutually exclusive with agent
  if (task) {
    items.push({
      key: 'task',
      label: task.title || `Task ${task.id}`,
      icon: FileText,
      onClick: onTaskClick,
      isClickable: !!conversation // Only clickable if we're in chat view
    });
  }

  // Agent (if selected) - mutually exclusive with task
  if (agent) {
    items.push({
      key: 'agent',
      label: agent.name,
      icon: Bot,
      onClick: onAgentClick,
      isClickable: !!conversation // Only clickable if we're in chat view
    });
  }

  // Conversation (if active)
  if (conversation) {
    items.push({
      key: 'conversation',
      label: 'Chat',
      icon: MessageSquare,
      onClick: null,
      isClickable: false
    });
  }

  return (
    <nav className={cn('flex items-center text-sm', className)} aria-label="Breadcrumb">
      <ol className="flex items-center flex-wrap gap-1">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isLast = index === items.length - 1;

          return (
            <li key={item.key} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground mx-1 flex-shrink-0" />
              )}
              {item.isClickable ? (
                <button
                  onClick={item.onClick}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[150px]">{item.label}</span>
                </button>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1',
                    isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[150px]">{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
