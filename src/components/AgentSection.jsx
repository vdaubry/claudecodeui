/**
 * AgentSection.jsx - Agent Workflow Section
 *
 * Displays automated agent workflows for a task.
 * Currently supports: Planification agent (creates a plan-mode conversation)
 */

import React, { useState } from 'react';
import { Play, Check, Loader2, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// Generate the planification agent message with task doc path
// Uses @agent-Plan to direct Claude SDK to use the planification sub-agent
const generatePlanificationMessage = (taskDocPath) => `@agent-Plan You are helping me plan the implementation of a task. Your goal is to create a comprehensive onboarding document that any developer can use to complete this task.

## Your Process

### 1. Ask Clarifying Questions First
Before creating any plan, ask me all questions you need to fully understand:
- The exact requirements and expected behavior
- Edge cases and error handling
- Any constraints or preferences
- Integration points with existing code

Do NOT proceed to planning until you have asked and received answers to your clarifying questions.

### 2. Explore the Codebase
Once you understand the requirements, explore the codebase to understand:
- Current implementation patterns
- Relevant files and components
- Testing patterns used in the project

### 3. Create the Implementation Plan
After gathering all information, update the task documentation file at:
\`${taskDocPath}\`

Structure the document as an onboarding guide for a new developer with these sections:

#### Overview
- Summary of what this task accomplishes
- Initial user request and context
- Key decisions made during planning

#### Implementation Plan
- Phase-by-phase breakdown with clear steps
- Files to modify/create for each phase
- Technical approach and architecture decisions

#### Testing Strategy
- **Unit Tests**: List specific unit tests to create or update
- **Manual Testing (Playwright MCP)**: Detailed scenarios including:
  - Navigation steps
  - Expected behavior to verify
  - Element selectors to check

#### To-Do List
Track progress with checkboxes. Include ALL steps:

**Implementation:**
- [ ] Phase 1: [description]
- [ ] Phase 2: [description]
- [ ] ...

**Testing:**
- [ ] Unit test: [test description]
- [ ] Unit test: [test description]
- [ ] Playwright: [scenario description]
- [ ] Playwright: [scenario description]

The documentation must be complete enough that a developer who understands the codebase but knows nothing about this specific task can implement it independently. This allows pausing and resuming implementation while maintaining clear progress tracking.

Please start by asking your clarifying questions.`;

// Agent type configurations
const AGENT_TYPES = [
  {
    type: 'planification',
    label: 'Planification',
    description: 'Create a detailed implementation plan',
    icon: FileText,
    getMessage: generatePlanificationMessage
  }
  // Future agents: implementation, review
];

function AgentSection({
  agentRuns = [],
  isLoading = false,
  onRunAgent,
  onResumeAgent,
  taskId,
  className
}) {
  const [runningType, setRunningType] = useState(null);

  const handleRunAgent = async (agentConfig) => {
    if (runningType) return; // Prevent double-click

    setRunningType(agentConfig.type);
    try {
      // Generate task doc path based on task ID (stored in .claude-ui/tasks/)
      const taskDocPath = `.claude-ui/tasks/task-${taskId}.md`;
      // Generate the message with the task doc path
      const message = agentConfig.getMessage
        ? agentConfig.getMessage(taskDocPath)
        : agentConfig.message;
      await onRunAgent(agentConfig.type, message);
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
