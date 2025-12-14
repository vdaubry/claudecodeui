/**
 * StatusSection.jsx - Group Tasks by Status
 *
 * Displays tasks grouped by status:
 * - ACTIVE NOW (streaming)
 * - IN PROGRESS (has conversations)
 * - PENDING (no conversations)
 * - COMPLETED (collapsed)
 */

import React from 'react';
import { Zap, Clock, Circle, CheckCircle2 } from 'lucide-react';
import TaskRow from './TaskRow';
import CompletedCollapse from './CompletedCollapse';
import { cn } from '../../lib/utils';
import { useTaskContext } from '../../contexts/TaskContext';

function StatusSection({
  tasks = [],
  isLoading,
  onTaskClick,
  onDeleteTask
}) {
  const { liveTaskIds } = useTaskContext();

  // Helper to check if a task is live (from context or task property)
  const checkIsLive = (task) => task.is_live || liveTaskIds.has(task.id);

  // Categorize tasks by status
  const activeTasks = tasks.filter(t => checkIsLive(t));
  const inProgressTasks = tasks.filter(t => !checkIsLive(t) && (t.conversation_count > 0 || t.has_conversations) && !t.completed);
  const pendingTasks = tasks.filter(t => !checkIsLive(t) && !t.conversation_count && !t.has_conversations && !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  if (isLoading && tasks.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="w-8 h-8 mx-auto border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        <p className="mt-4">Loading tasks...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Circle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No tasks across projects</p>
        <p className="text-sm mt-1">Expand projects to load their tasks</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Now Section */}
      {activeTasks.length > 0 && (
        <StatusGroup
          icon={<Zap className="w-4 h-4" />}
          title="ACTIVE NOW"
          count={activeTasks.length}
          colorClass="text-red-500 bg-red-500/10"
          isLive
        >
          {activeTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              project={task.project}
              showProject
              onClick={() => onTaskClick(task)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))}
        </StatusGroup>
      )}

      {/* In Progress Section */}
      {inProgressTasks.length > 0 && (
        <StatusGroup
          icon={<Clock className="w-4 h-4" />}
          title="IN PROGRESS"
          count={inProgressTasks.length}
          colorClass="text-yellow-600 dark:text-yellow-400 bg-yellow-500/10"
        >
          {inProgressTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              project={task.project}
              showProject
              onClick={() => onTaskClick(task)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))}
        </StatusGroup>
      )}

      {/* Pending Section */}
      {pendingTasks.length > 0 && (
        <StatusGroup
          icon={<Circle className="w-4 h-4" />}
          title="PENDING"
          count={pendingTasks.length}
          colorClass="text-muted-foreground bg-muted"
        >
          {pendingTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              project={task.project}
              showProject
              onClick={() => onTaskClick(task)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))}
        </StatusGroup>
      )}

      {/* Completed Section */}
      {completedTasks.length > 0 && (
        <CompletedCollapse
          tasks={completedTasks}
          onTaskClick={onTaskClick}
          showProject
        />
      )}
    </div>
  );
}

// Status Group Component
function StatusGroup({
  icon,
  title,
  count,
  colorClass,
  isLive,
  children
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-3 border-b border-border',
        colorClass
      )}>
        {icon}
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-xs opacity-75">({count})</span>
        {isLive && (
          <span className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            streaming
          </span>
        )}
      </div>

      {/* Tasks */}
      <div className="divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

export default StatusSection;
