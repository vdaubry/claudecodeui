/**
 * AgentFilesTabBar.jsx - Tab navigation for Agent Files section
 *
 * Switches between "Input Attachments" and "Output Files" tabs.
 */

import React from 'react';
import { Paperclip, FolderOutput } from 'lucide-react';
import { cn } from '../lib/utils';

function AgentFilesTabBar({ activeTab, onTabChange, inputCount = 0, outputCount = 0 }) {
  return (
    <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/30">
      <button
        onClick={() => onTabChange('input')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          activeTab === 'input'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
        )}
      >
        <Paperclip className="w-3.5 h-3.5" />
        Input Attachments
        {inputCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
            {inputCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onTabChange('output')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          activeTab === 'output'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
        )}
      >
        <FolderOutput className="w-3.5 h-3.5" />
        Output Files
        {outputCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
            {outputCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default AgentFilesTabBar;
