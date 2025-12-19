/**
 * AgentSection.jsx - Agent Workflow Section
 *
 * Displays automated agent workflows for a task.
 * Backend handles agent execution and auto-chaining (implementation <-> review loop).
 */

import React, { useState } from 'react';
import { Play, Check, Loader2, FileText, Code, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// Agent type configurations
// Message generation is now handled on the backend
const AGENT_TYPES = [
  {
    type: 'planification',
    label: 'Planification',
    description: 'Create a detailed implementation plan',
    icon: FileText
  },
  {
    type: 'implementation',
    label: 'Implementation',
    description: 'Implement the next phase from the plan',
    icon: Code
  },
  {
    type: 'review',
    label: 'Review',
    description: 'Review implementation and run tests',
    icon: CheckCircle
  }
];

function AgentSection({
  agentRuns = [],
  isLoading = false,
  onRunAgent,
  onResumeAgent,
  className
}) {
  const [runningType, setRunningType] = useState(null);

  const handleRunAgent = async (agentConfig) => {
    if (runningType) return; // Prevent double-click

    setRunningType(agentConfig.type);
    try {
      // Backend handles message generation and streaming
      await onRunAgent(agentConfig.type);
    } finally {
      setRunningType(null);
    }
  };

  const getAgentStatus = (agentType) => {
    const run = agentRuns.find(r => r.agent_type === agentType);
    return run?.status || null;
  };

  const getAgentRun = (agentType) => {
    return agentRuns.find(r => r.agent_type === agentType);
  };

  const handleResumeAgent = (agentRun) => {
    if (agentRun?.conversation_id && onResumeAgent) {
      onResumeAgent(agentRun.conversation_id);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('p-4 border-t border-border', className)}>
        <h3 className="text-sm font-medium text-foreground mb-3">Agents</h3>
        <div className="animate-pulse space-y-2">
          <div className="h-16 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-4 border-t border-border', className)}>
      <h3 className="text-sm font-medium text-foreground mb-3">Agents</h3>
      <div className="space-y-2">
        {AGENT_TYPES.map((agent) => {
          const status = getAgentStatus(agent.type);
          const agentRun = getAgentRun(agent.type);
          const isRunning = runningType === agent.type;
          const isCompleted = status === 'completed';
          const isInProgress = status === 'running' || status === 'pending';
          const Icon = agent.icon;

          return (
            <div
              key={agent.type}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border transition-colors',
                isCompleted
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                  : isInProgress
                  ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  isCompleted
                    ? 'bg-green-100 dark:bg-green-800'
                    : isInProgress
                    ? 'bg-blue-100 dark:bg-blue-800'
                    : 'bg-muted'
                )}>
                  <Icon className={cn(
                    'w-4 h-4',
                    isCompleted
                      ? 'text-green-600 dark:text-green-400'
                      : isInProgress
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-muted-foreground'
                  )} />
                </div>
                <div>
                  <p className="text-sm font-medium">{agent.label}</p>
                  <p className="text-xs text-muted-foreground">{agent.description}</p>
                </div>
              </div>

              <Button
                variant={isCompleted ? 'ghost' : 'outline'}
                size="sm"
                onClick={() => {
                  if (isInProgress || isCompleted) {
                    handleResumeAgent(agentRun);
                  } else {
                    handleRunAgent(agent);
                  }
                }}
                disabled={isRunning}
                className={cn(
                  'gap-2',
                  isCompleted && 'text-green-600 dark:text-green-400'
                )}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : isCompleted ? (
                  <>
                    <Check className="w-4 h-4" />
                    Completed
                  </>
                ) : isInProgress ? (
                  <>
                    <Play className="w-4 h-4" />
                    In Progress
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AgentSection;
