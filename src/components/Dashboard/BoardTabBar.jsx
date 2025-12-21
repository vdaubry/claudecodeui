/**
 * BoardTabBar.jsx - Tab navigation for Board View
 *
 * Switches between "Development" (tasks) and "Custom Agents" tabs.
 */

import React from 'react';
import { Columns, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';

function BoardTabBar({ activeTab, onTabChange, agentsCount = 0 }) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      <button
        onClick={() => onTabChange('development')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
          activeTab === 'development'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Columns className="w-4 h-4" />
        Development
      </button>
      <button
        onClick={() => onTabChange('agents')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
          activeTab === 'agents'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Bot className="w-4 h-4" />
        Custom Agents
        {agentsCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
            {agentsCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default BoardTabBar;
