/**
 * AgentDetailView.jsx - Agent Detail Page
 *
 * Displays agent details including:
 * - Breadcrumb navigation
 * - Agent name
 * - Agent prompt (editable markdown - used as system prompt)
 * - File attachments (auto-read by Claude at conversation start)
 * - Conversation history with New/Resume buttons
 */

import React, { useState } from 'react';
import { Bot, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import Breadcrumb from './Breadcrumb';
import MarkdownEditor from './MarkdownEditor';
import ConversationList from './ConversationList';
import AgentAttachments from './AgentAttachments';
import AgentOutputFiles from './AgentOutputFiles';
import AgentFilesTabBar from './AgentFilesTabBar';
import { cn } from '../lib/utils';

function AgentDetailView({
  project,
  agent,
  agentPrompt = '',
  conversations = [],
  isLoadingPrompt = false,
  isLoadingConversations = false,
  // Attachments (input files)
  agentAttachments = [],
  isLoadingAttachments = false,
  onUploadAttachment,
  onDeleteAttachment,
  // Output files
  agentOutputFiles = [],
  isLoadingOutputFiles = false,
  onDownloadOutputFile,
  onDeleteOutputFile,
  // Callbacks
  onBack,
  onProjectClick,
  onHomeClick,
  onSavePrompt,
  onEditPrompt,
  onNewConversation,
  onResumeConversation,
  onDeleteConversation,
  className
}) {
  const [filesTab, setFilesTab] = useState('input');
  if (!agent) return null;

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header with breadcrumb */}
      <div className="p-4 border-b border-border">
        {/* Back button and breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Breadcrumb
            project={project}
            agent={agent}
            onProjectClick={onProjectClick}
            onHomeClick={onHomeClick}
          />
        </div>

        {/* Agent header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {agent.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Custom Agent in {project?.name || 'Unknown Project'}
            </p>
          </div>
        </div>
      </div>

      {/* Content - Split view */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left panel - Conversations */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border">
          <ConversationList
            conversations={conversations}
            isLoading={isLoadingConversations}
            onNewConversation={onNewConversation}
            onResumeConversation={onResumeConversation}
            onDeleteConversation={onDeleteConversation}
            className="h-full"
          />
        </div>

        {/* Right panel - Agent Prompt + Attachments */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {/* Agent Prompt Section */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-4 pb-2 border-b border-border">
              <h3 className="text-sm font-medium text-foreground">Agent System Prompt</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                This prompt is passed to Claude as the system prompt when starting conversations.
              </p>
            </div>
            <MarkdownEditor
              content={agentPrompt}
              onSave={onSavePrompt}
              onEditClick={onEditPrompt}
              isLoading={isLoadingPrompt}
              placeholder="No agent prompt configured yet. Click Edit to add a system prompt that will be used when chatting with this agent."
              className="flex-1 min-h-0"
            />
          </div>

          {/* Files Section with Tabs */}
          <div className="border-t border-border flex-shrink-0">
            <AgentFilesTabBar
              activeTab={filesTab}
              onTabChange={setFilesTab}
              inputCount={agentAttachments.length}
              outputCount={agentOutputFiles.length}
            />
            {filesTab === 'input' ? (
              <AgentAttachments
                attachments={agentAttachments}
                isLoading={isLoadingAttachments}
                onUpload={onUploadAttachment}
                onDelete={onDeleteAttachment}
                className="max-h-56 overflow-auto"
              />
            ) : (
              <AgentOutputFiles
                files={agentOutputFiles}
                isLoading={isLoadingOutputFiles}
                onDownload={onDownloadOutputFile}
                onDelete={onDeleteOutputFile}
                className="max-h-56 overflow-auto"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentDetailView;
