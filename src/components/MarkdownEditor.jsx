/**
 * MarkdownEditor.jsx - Markdown View/Edit Component
 *
 * Displays markdown content with a view/edit toggle.
 * Used for project and task documentation in the task-driven workflow.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Save, X, Eye, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

function MarkdownEditor({
  content,
  onSave,
  isLoading = false,
  placeholder = 'No documentation yet. Click Edit to add content.',
  className,
  editable = true
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Sync edit content when external content changes
  useEffect(() => {
    setEditContent(content);
  }, [content]);

  const handleEdit = useCallback(() => {
    setEditContent(content);
    setIsEditing(true);
    setError(null);
  }, [content]);

  const handleCancel = useCallback(() => {
    setEditContent(content);
    setIsEditing(false);
    setError(null);
  }, [content]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    setError(null);

    try {
      const result = await onSave(editContent);
      if (result.success) {
        setIsEditing(false);
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [editContent, onSave]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [handleCancel, handleSave]);

  // Simple markdown to HTML rendering (basic support)
  const renderMarkdown = (text) => {
    if (!text) return null;

    // Very basic markdown rendering
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeBlockContent = [];
    let codeBlockLang = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${i}`}
              className="bg-muted rounded-md p-4 overflow-x-auto my-2 text-sm"
            >
              <code>{codeBlockContent.join('\n')}</code>
            </pre>
          );
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          codeBlockLang = line.slice(3);
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Headers
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={i} className="text-lg font-semibold mt-4 mb-2">
            {line.slice(4)}
          </h3>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={i} className="text-xl font-semibold mt-6 mb-2">
            {line.slice(3)}
          </h2>
        );
      } else if (line.startsWith('# ')) {
        elements.push(
          <h1 key={i} className="text-2xl font-bold mt-6 mb-3">
            {line.slice(2)}
          </h1>
        );
      }
      // List items
      else if (line.match(/^[-*] /)) {
        elements.push(
          <li key={i} className="ml-4 list-disc">
            {renderInlineMarkdown(line.slice(2))}
          </li>
        );
      }
      // Numbered list
      else if (line.match(/^\d+\. /)) {
        elements.push(
          <li key={i} className="ml-4 list-decimal">
            {renderInlineMarkdown(line.replace(/^\d+\. /, ''))}
          </li>
        );
      }
      // Horizontal rule
      else if (line.match(/^---+$/)) {
        elements.push(<hr key={i} className="my-4 border-border" />);
      }
      // Empty line
      else if (line.trim() === '') {
        elements.push(<div key={i} className="h-2" />);
      }
      // Regular paragraph
      else {
        elements.push(
          <p key={i} className="my-1">
            {renderInlineMarkdown(line)}
          </p>
        );
      }
    }

    return elements;
  };

  // Render inline markdown (bold, italic, code, links)
  const renderInlineMarkdown = (text) => {
    if (!text) return null;

    // Split text by markdown patterns
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Bold **text**
      let match = remaining.match(/\*\*([^*]+)\*\*/);
      if (match && match.index === 0) {
        parts.push(<strong key={key++}>{match[1]}</strong>);
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Italic *text* or _text_
      match = remaining.match(/(?:\*([^*]+)\*|_([^_]+)_)/);
      if (match && match.index === 0) {
        parts.push(<em key={key++}>{match[1] || match[2]}</em>);
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Inline code `code`
      match = remaining.match(/`([^`]+)`/);
      if (match && match.index === 0) {
        parts.push(
          <code key={key++} className="bg-muted px-1 py-0.5 rounded text-sm">
            {match[1]}
          </code>
        );
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Link [text](url)
      match = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match && match.index === 0) {
        parts.push(
          <a
            key={key++}
            href={match[2]}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {match[1]}
          </a>
        );
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // No pattern matched - add next character
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }

    return parts;
  };

  if (isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with actions */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isEditing ? (
            <>
              <Edit2 className="w-4 h-4" />
              <span>Editing</span>
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              <span>Documentation</span>
            </>
          )}
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit2 className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-3 mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter markdown content..."
            className="w-full h-full min-h-[200px] p-3 bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
            autoFocus
          />
        ) : content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {renderMarkdown(content)}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{placeholder}</p>
          </div>
        )}
      </div>

      {/* Keyboard hints when editing */}
      {isEditing && (
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl</kbd>+
            <kbd className="px-1.5 py-0.5 bg-muted rounded">S</kbd> Save
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> Cancel
          </span>
        </div>
      )}
    </div>
  );
}

export default MarkdownEditor;
