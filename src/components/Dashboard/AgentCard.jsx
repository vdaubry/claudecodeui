/**
 * AgentCard.jsx - Agent Card for Agents Grid
 *
 * Displays an agent with its name, conversation count,
 * and edit/delete actions.
 */

import React from 'react';
import { Bot, MessageSquare, Pencil, Trash2, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

function AgentCard({
  agent,
  conversationCount = 0,
  onClick,
  onEditClick,
  onDeleteClick
}) {
  const handleEditClick = (e) => {
    e.stopPropagation();
    onEditClick?.(agent);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDeleteClick?.(agent);
  };

  return (
    <div
      data-testid={`agent-card-${agent.id}`}
      onClick={() => onClick?.(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(agent);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative p-4 rounded-lg border transition-all duration-150',
        'bg-gradient-to-br from-card to-card/80',
        'hover:from-accent/30 hover:to-accent/50',
        'cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'shadow-sm hover:shadow-md',
        'hover:scale-[1.02] active:scale-[0.98]',
        'transform-gpu',
        'border-border hover:border-primary/30'
      )}
    >
      {/* Schedule indicator - top right */}
      {agent.schedule_enabled === 1 && (
        <div className="absolute top-2 right-2" title="Scheduled">
          <div className="p-1 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
      )}

      {/* Agent icon and name */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-foreground leading-tight truncate">
            {agent.name}
          </h4>
          {/* Conversation count */}
          {conversationCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <MessageSquare className="w-3 h-3" />
              <span>{conversationCount} conversation{conversationCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons - appear on hover */}
      <div className={cn(
        'absolute bottom-2 right-2 flex items-center gap-1',
        'opacity-0 group-hover:opacity-100',
        'transition-opacity'
      )}>
        <button
          type="button"
          onClick={handleEditClick}
          className={cn(
            'p-1.5 rounded-md transition-all',
            'text-muted-foreground hover:text-primary',
            'hover:bg-primary/10',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          title="Edit agent"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          className={cn(
            'p-1.5 rounded-md transition-all',
            'text-muted-foreground hover:text-red-500',
            'hover:bg-red-500/10',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          title="Delete agent"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default AgentCard;
