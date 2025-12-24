/**
 * AgentEditPageWrapper.jsx - Agent Edit Page Wrapper
 *
 * Loads project, agent, and prompt from URL params.
 * Handles navigation after save/delete.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Trash2,
  Bot,
  AlertTriangle,
  Clock,
  Check,
  AlertCircle
} from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { MicButton } from '../components/MicButton';
import { useTaskContext } from '../contexts/TaskContext';
import { useAgentContext } from '../contexts/AgentContext';
import { useAuthToken } from '../hooks/useAuthToken';
import { cn } from '../lib/utils';

// Schedule presets for common cron patterns
const SCHEDULE_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9 AM', value: '0 9 * * *' },
  { label: 'Every day at 6 PM', value: '0 18 * * *' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'Every 1st of month', value: '0 9 1 * *' },
];

function AgentEditPageWrapper() {
  const { projectId, agentId } = useParams();
  const navigate = useNavigate();
  const { getTokenParam } = useAuthToken();
  const {
    projects,
    loadProjects,
    isLoadingProjects
  } = useTaskContext();
  const {
    agents,
    loadAgents,
    agentPrompt,
    loadAgentPrompt,
    updateAgent,
    deleteAgent,
    saveAgentPrompt,
    validateCronExpression,
    isLoadingAgents,
    isLoadingAgentPrompt
  } = useAgentContext();

  const [project, setProject] = useState(null);
  const [agent, setAgent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [cronPrompt, setCronPrompt] = useState('');
  const [cronValidation, setCronValidation] = useState(null);
  const [isValidatingCron, setIsValidatingCron] = useState(false);

  const nameInputRef = useRef(null);

  // Load project data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (projects.length === 0 && !isLoadingProjects) {
          await loadProjects();
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [projectId, loadProjects, projects.length, isLoadingProjects]);

  // Find project and load agents
  useEffect(() => {
    if (projects.length > 0) {
      const foundProject = projects.find(p => p.id === parseInt(projectId));
      if (foundProject) {
        setProject(foundProject);
        loadAgents(foundProject.id);
      } else {
        navigate(`/${getTokenParam()}`, { replace: true });
      }
    }
  }, [projects, projectId, loadAgents, navigate, getTokenParam]);

  // Find agent and load prompt
  useEffect(() => {
    if (agents.length > 0 && project) {
      const foundAgent = agents.find(a => a.id === parseInt(agentId));
      if (foundAgent) {
        setAgent(foundAgent);
        loadAgentPrompt(foundAgent.id);
      } else {
        navigate(`/projects/${projectId}?tab=agents${getTokenParam() ? '&' + getTokenParam().slice(1) : ''}`, { replace: true });
      }
    }
  }, [agents, agentId, project, projectId, loadAgentPrompt, navigate, getTokenParam]);

  // Initialize form with agent data
  useEffect(() => {
    if (agent) {
      setName(agent.name || '');
      setPrompt(agentPrompt || '');
      setScheduleEnabled(!!agent.schedule_enabled);
      setSchedule(agent.schedule || '');
      setCronPrompt(agent.cron_prompt || '');
      setHasChanges(false);
      setError(null);
    }
  }, [agent, agentPrompt]);

  // Track changes
  useEffect(() => {
    if (!agent) return;
    const nameChanged = name !== (agent.name || '');
    const promptChanged = prompt !== (agentPrompt || '');
    const scheduleEnabledChanged = scheduleEnabled !== !!agent.schedule_enabled;
    const scheduleChanged = schedule !== (agent.schedule || '');
    const cronPromptChanged = cronPrompt !== (agent.cron_prompt || '');
    setHasChanges(nameChanged || promptChanged || scheduleEnabledChanged || scheduleChanged || cronPromptChanged);
  }, [name, prompt, agent, agentPrompt, scheduleEnabled, schedule, cronPrompt]);

  // Validate cron expression when schedule changes
  useEffect(() => {
    if (!schedule) {
      setCronValidation(null);
      return;
    }

    const validateTimeout = setTimeout(async () => {
      setIsValidatingCron(true);
      try {
        const result = await validateCronExpression(schedule);
        setCronValidation(result);
      } catch (err) {
        setCronValidation({ valid: false, error: err.message });
      } finally {
        setIsValidatingCron(false);
      }
    }, 500);

    return () => clearTimeout(validateTimeout);
  }, [schedule, validateCronExpression]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!agent) return;
    if (!name.trim()) {
      setError('Agent name is required');
      nameInputRef.current?.focus();
      return;
    }

    // Validate cron expression if schedule is enabled
    if (scheduleEnabled && schedule && cronValidation && !cronValidation.valid) {
      setError('Invalid cron expression');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Update agent metadata including schedule
      const agentResult = await updateAgent(agent.id, {
        name: name.trim(),
        schedule: schedule || null,
        cron_prompt: cronPrompt || null,
        schedule_enabled: scheduleEnabled
      });

      if (!agentResult.success) {
        setError(agentResult.error || 'Failed to save agent');
        setIsSaving(false);
        return;
      }

      // Save prompt separately
      const promptResult = await saveAgentPrompt(agent.id, prompt);

      if (promptResult.success) {
        navigate(`/projects/${projectId}/agents/${agentId}${getTokenParam()}`);
      } else {
        setError(promptResult.error || 'Agent saved but failed to save prompt');
      }
    } catch (err) {
      setError(err.message || 'Failed to save agent');
    } finally {
      setIsSaving(false);
    }
  }, [agent, name, prompt, scheduleEnabled, schedule, cronPrompt, cronValidation, updateAgent, saveAgentPrompt, navigate, projectId, agentId, getTokenParam]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!agent) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteAgent(agent.id);

      if (result.success) {
        navigate(`/projects/${projectId}?tab=agents${getTokenParam() ? '&' + getTokenParam().slice(1) : ''}`);
      } else {
        setError(result.error || 'Failed to delete agent');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete agent');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }, [agent, deleteAgent, navigate, projectId, getTokenParam]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    navigate(`/projects/${projectId}/agents/${agentId}${getTokenParam()}`);
  }, [navigate, projectId, agentId, getTokenParam]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          handleCancel();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [showDeleteConfirm, handleCancel, handleSave]
  );

  // Loading state
  if (isLoading || isLoadingProjects || isLoadingAgents || !project || !agent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-12 h-12 mx-auto mb-4">
            <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
          </div>
          <p>Loading agent...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-background"
      onKeyDown={handleKeyDown}
      data-testid="agent-edit-page"
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-background border-b border-border p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-8 w-8 p-0 flex-shrink-0"
              title="Back"
              data-testid="back-button"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Bot className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="font-semibold truncate">Edit Agent</span>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2"
          data-testid="error-message"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Agent name */}
          <div className="space-y-2">
            <label
              htmlFor="agent-name"
              className="text-sm font-medium text-foreground"
            >
              Agent Name
            </label>
            <Input
              id="agent-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name..."
              className="text-base"
              data-testid="name-input"
            />
          </div>

          {/* Project context (read-only) */}
          {project && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Project
              </label>
              <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
                {project.name}
              </div>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label
                  htmlFor="agent-prompt"
                  className="text-sm font-medium text-foreground"
                >
                  System Prompt
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This prompt is passed to Claude as the system prompt when starting conversations.
                </p>
              </div>
              <MicButton
                onTranscript={(transcript) => {
                  setPrompt((prev) => {
                    if (!prev.trim()) return transcript;
                    return prev.trimEnd() + ' ' + transcript;
                  });
                }}
              />
            </div>
            {isLoadingAgentPrompt ? (
              <div className="animate-pulse space-y-2 p-4 border border-border rounded-md">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </div>
            ) : (
              <div data-color-mode="auto">
                <MDEditor
                  value={prompt}
                  onChange={(val) => setPrompt(val || '')}
                  preview="edit"
                  height={300}
                  visibleDragbar={true}
                  hideToolbar={false}
                  data-testid="prompt-editor"
                  textareaProps={{
                    placeholder: 'Add agent system prompt in markdown format...'
                  }}
                />
              </div>
            )}
          </div>

          {/* Schedule Section */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">Scheduled Execution</h3>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Enable Schedule
                </label>
                <p className="text-xs text-muted-foreground">
                  Automatically run this agent on a schedule
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  scheduleEnabled ? 'bg-primary' : 'bg-muted'
                )}
                data-testid="schedule-toggle"
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    scheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* Frequency (Cron Expression) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Frequency
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SCHEDULE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSchedule(preset.value)}
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
              <Input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="Cron expression: * * * * * (min hour day month weekday)"
                className="font-mono text-sm"
                data-testid="schedule-input"
              />
              {schedule && (
                <div className="flex items-start gap-2 text-xs">
                  {isValidatingCron ? (
                    <span className="text-muted-foreground">Validating...</span>
                  ) : cronValidation?.valid ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-green-600">{cronValidation.description}</span>
                    </>
                  ) : cronValidation?.error ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                      <span className="text-destructive">{cronValidation.error}</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {/* Cron Prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Scheduled Prompt
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
                data-testid="cron-prompt-input"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              variant="default"
              onClick={handleSave}
              disabled={isSaving || isDeleting || !hasChanges}
              data-testid="save-button"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving || isDeleting}
            >
              Cancel
            </Button>
          </div>

          {/* Danger zone */}
          <div className="pt-6 border-t border-border">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-destructive">
                Danger Zone
              </h3>

              {showDeleteConfirm ? (
                <div
                  className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3"
                  data-testid="delete-confirmation"
                >
                  <p className="text-sm text-foreground">
                    Are you sure you want to delete this agent? This will also
                    delete all conversations with this agent. This action
                    cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      data-testid="confirm-delete-button"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      {isDeleting ? 'Deleting...' : 'Yes, Delete Agent'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      data-testid="cancel-delete-button"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  data-testid="delete-button"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete Agent
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4 bg-muted/30">
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl</kbd>+
          <kbd className="px-1.5 py-0.5 bg-muted rounded">S</kbd> Save
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> Cancel
        </span>
      </div>
    </div>
  );
}

export default AgentEditPageWrapper;
