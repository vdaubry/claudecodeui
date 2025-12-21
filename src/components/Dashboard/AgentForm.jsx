/**
 * AgentForm.jsx - Agent Create/Edit Modal
 *
 * Modal for creating or editing an agent.
 * Only requires a name - prompt is edited on detail page.
 */

import React, { useState, useEffect } from 'react';
import { X, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

function AgentForm({
  isOpen,
  onClose,
  onSubmit,
  projectName,
  agent = null, // If provided, we're editing
  isSubmitting = false
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const isEditing = !!agent;

  // Reset form when modal opens/closes or agent changes
  useEffect(() => {
    if (isOpen) {
      setName(agent?.name || '');
      setError(null);
    }
  }, [isOpen, agent]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Agent name is required');
      return;
    }

    try {
      const result = await onSubmit({
        name: name.trim()
      });

      if (!result.success) {
        setError(result.error || `Failed to ${isEditing ? 'update' : 'create'} agent`);
      }
    } catch (err) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} agent`);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-card rounded-lg shadow-xl border border-border w-full max-w-md mx-4"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {isEditing ? 'Edit Agent' : 'Create New Agent'}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Project context */}
          {projectName && !isEditing && (
            <div className="text-sm text-muted-foreground">
              Creating agent in: <span className="font-medium text-foreground">{projectName}</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Agent name */}
          <div className="space-y-2">
            <label htmlFor="agent-name" className="text-sm font-medium text-foreground">
              Agent Name
            </label>
            <Input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this agent"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Give your agent a descriptive name. You can configure its prompt on the agent detail page.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              className="flex-1"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                isEditing ? 'Save Changes' : 'Create Agent'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AgentForm;
