import { WebSocket } from 'ws';

function createBroadcastFn(req) {
  const wss = req.app.locals.wss;
  return (convId, msg) => {
    if (!wss) return;
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    });
  };
}

export function createConversationHandler(adapter) {
  return async (req, res) => {
    try {
      const userId = req.user.id;
      const entityId = adapter.getId(req);
      const { message, projectPath, permissionMode } = req.body || {};

      if (isNaN(entityId)) {
        return res.status(400).json({ error: adapter.invalidIdMessage });
      }

      const entityWithProject = adapter.getEntityWithProject(entityId);
      if (!entityWithProject || entityWithProject.user_id !== userId) {
        return res.status(404).json({ error: adapter.notFoundMessage });
      }

      let conversation = null;
      if (adapter.precreateConversation) {
        conversation = adapter.createConversation(entityId);
        if (adapter.onConversationCreated) {
          adapter.onConversationCreated({ userId, entityId, conversation, entityWithProject });
        }
      }

      if (!message) {
        if (!conversation) {
          conversation = adapter.createConversation(entityId);
          if (adapter.onConversationCreated) {
            adapter.onConversationCreated({ userId, entityId, conversation, entityWithProject });
          }
        }
        return res.status(201).json(conversation);
      }

      const customSystemPrompt = adapter.buildSystemPrompt
        ? adapter.buildSystemPrompt(entityWithProject.repo_folder_path, entityId, projectPath)
        : null;

      const broadcastFn = createBroadcastFn(req);

      try {
        const { conversationId, claudeSessionId } = await adapter.startSession(entityId, message.trim(), {
          broadcastFn,
          userId,
          customSystemPrompt,
          permissionMode: permissionMode || 'bypassPermissions',
          conversationId: conversation?.id
        });

        const responseConversation = conversation || adapter.getConversationById(conversationId);
        return res.status(201).json({
          ...responseConversation,
          claude_conversation_id: claudeSessionId
        });
      } catch (sessionError) {
        if (adapter.cleanupConversationOnSessionError && conversation?.id) {
          adapter.deleteConversation(conversation.id);
        }
        console.error(adapter.sessionErrorLogPrefix, sessionError);
        return res.status(500).json({ error: 'Session creation failed: ' + sessionError.message });
      }
    } catch (error) {
      console.error(adapter.generalErrorLogPrefix, error);
      res.status(500).json({ error: adapter.generalErrorMessage });
    }
  };
}
