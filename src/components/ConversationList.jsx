/**
 * ConversationList.jsx - Conversation History Component
 *
 * Displays a list of conversations for a task with:
 * - "+" button to start a new conversation
 * - "Resume" button on each existing conversation
 * - Timestamp and preview for each conversation
 */

import React, { useState } from 'react';
import { Plus, MessageSquare, Clock, Trash2, Play } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// Format relative time
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();

  if (isNaN(date.getTime())) {
    return 'Unknown';
  }

  const diffInMs = now - date;
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInSeconds < 60) return 'Just now';
  if (diffInMinutes === 1) return '1 min ago';
  if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
  if (diffInHours === 1) return '1 hour ago';
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  if (diffInDays === 1) return '1 day ago';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  return date.toLocaleDateString();
}

function ConversationList({
  conversations = [],
  isLoading = false,
  onNewConversation,
  onResumeConversation,
  onDeleteConversation,
  activeConversationId,
  className
}) {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (e, conversationId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    setDeletingId(conversationId);
    try {
      await onDeleteConversation(conversationId);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">Conversations</h3>
          <div className="w-20 h-8 bg-muted rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-lg border border-border animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Conversations
          {conversations.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({conversations.length})
            </span>
          )}
        </h3>
        <Button
          variant="default"
          size="sm"
          onClick={onNewConversation}
          className="h-8"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Chat
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto p-2">
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start a new chat to begin working on this task</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conversation) => {
              const isActive = activeConversationId === conversation.id;
              const isDeleting = deletingId === conversation.id;

              return (
                <div
                  key={conversation.id}
                  data-testid={`conversation-row-${conversation.id}`}
                  className={cn(
                    'group p-3 rounded-lg border transition-colors cursor-pointer',
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  )}
                  onClick={() => onResumeConversation(conversation)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">
                          Conversation #{conversation.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeAgo(conversation.created_at)}</span>
                        {conversation.claude_conversation_id && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            Linked
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResumeConversation(conversation);
                        }}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Resume
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(e, conversation.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
