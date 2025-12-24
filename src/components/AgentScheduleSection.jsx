/**
 * AgentScheduleSection.jsx - Schedule Configuration for Agents
 *
 * Allows users to configure:
 * - Enable/disable scheduling toggle
 * - Cron expression (manual input OR preset selection)
 * - Cron prompt (message to send when triggered)
 * - Display of next scheduled run
 * - Manual trigger button
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Play, Calendar, AlertCircle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';

// Preset intervals for common schedules
const SCHEDULE_PRESETS = [
  { label: 'Every minute (testing)', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9 AM', value: '0 9 * * *' },
  { label: 'Every day at 6 PM', value: '0 18 * * *' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'Every 1st of month at 9 AM', value: '0 9 1 * *' },
];

function AgentScheduleSection({
  agent,
  onUpdateAgent,
  onValidateCron,
  onTriggerAgent,
  isUpdating = false,
  className
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [cronPrompt, setCronPrompt] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize from agent data
  useEffect(() => {
    if (agent) {
      setScheduleEnabled(!!agent.schedule_enabled);
      setSchedule(agent.schedule || '');
      setCronPrompt(agent.cron_prompt || '');
      setHasChanges(false);
      // Auto-expand if schedule is already configured
      if (agent.schedule_enabled || agent.schedule || agent.cron_prompt) {
        setIsExpanded(true);
      }
    }
  }, [agent]);

  // Track changes
  useEffect(() => {
    if (!agent) return;
    const hasScheduleChange = schedule !== (agent.schedule || '');
    const hasCronPromptChange = cronPrompt !== (agent.cron_prompt || '');
    const hasEnabledChange = scheduleEnabled !== !!agent.schedule_enabled;
    setHasChanges(hasScheduleChange || hasCronPromptChange || hasEnabledChange);
  }, [agent, schedule, cronPrompt, scheduleEnabled]);

  // Validate cron expression when it changes
  useEffect(() => {
    if (!schedule) {
      setValidationResult(null);
      return;
    }

    const validateTimeout = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await onValidateCron(schedule);
        setValidationResult(result);
      } catch (error) {
        setValidationResult({ valid: false, error: error.message });
      } finally {
        setIsValidating(false);
      }
    }, 500); // Debounce validation

    return () => clearTimeout(validateTimeout);
  }, [schedule, onValidateCron]);

  const handlePresetSelect = useCallback((presetValue) => {
    setSchedule(presetValue);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onUpdateAgent(agent.id, {
        schedule: schedule || null,
        cron_prompt: cronPrompt || null,
        schedule_enabled: scheduleEnabled
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving schedule:', error);
    } finally {
      setIsSaving(false);
    }
  }, [agent, schedule, cronPrompt, scheduleEnabled, onUpdateAgent]);

  const handleTrigger = useCallback(async () => {
    if (!agent.cron_prompt) return;
    setIsTriggering(true);
    try {
      await onTriggerAgent(agent.id);
    } catch (error) {
      console.error('Error triggering agent:', error);
    } finally {
      setIsTriggering(false);
    }
  }, [agent, onTriggerAgent]);

  const formatNextRun = (isoDate) => {
    if (!isoDate) return null;
    try {
      const date = new Date(isoDate);
      return date.toLocaleString();
    } catch {
      return null;
    }
  };

  if (!agent) return null;

  return (
    <div className={cn('border-t border-border', className)}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Schedule</span>
          {agent.schedule_enabled && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded">
              ACTIVE
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">
              Enable scheduled execution
            </label>
            <button
              onClick={() => setScheduleEnabled(!scheduleEnabled)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                scheduleEnabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  scheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          {/* Schedule Presets */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Schedule</label>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetSelect(preset.value)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md border transition-colors',
                    schedule === preset.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground text-muted-foreground hover:text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Cron Expression */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Cron Expression
            </label>
            <Input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="* * * * * (min hour day month weekday)"
              className="font-mono text-sm"
            />
            {/* Validation Result */}
            {schedule && (
              <div className="flex items-start gap-2 text-xs">
                {isValidating ? (
                  <span className="text-muted-foreground">Validating...</span>
                ) : validationResult?.valid ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-green-600">{validationResult.description}</span>
                  </>
                ) : validationResult?.error ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-destructive">{validationResult.error}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Cron Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Cron Prompt
            </label>
            <p className="text-xs text-muted-foreground">
              This message will be sent to Claude when the schedule triggers.
            </p>
            <Textarea
              value={cronPrompt}
              onChange={(e) => setCronPrompt(e.target.value)}
              placeholder="Enter the prompt to send when the schedule triggers..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Next Run Info */}
          {agent.schedule_enabled && agent.next_run_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
              <Calendar className="w-3.5 h-3.5" />
              <span>Next run: {formatNextRun(agent.next_run_at)}</span>
            </div>
          )}

          {agent.last_run_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Last run: {formatNextRun(agent.last_run_at)}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving || (schedule && !validationResult?.valid)}
              size="sm"
              className="flex-1"
            >
              {isSaving ? 'Saving...' : hasChanges ? 'Save Schedule' : 'Saved'}
            </Button>
            <Button
              onClick={handleTrigger}
              disabled={!agent.cron_prompt || isTriggering}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {isTriggering ? 'Running...' : 'Run Now'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentScheduleSection;
