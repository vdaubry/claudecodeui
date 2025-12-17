import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseJsonlSessions, getSessionMessages } from './sessions.js';

describe('Sessions Service', () => {
  let tempDir;
  let claudeProjectDir;

  beforeEach(() => {
    // Create a temp directory structure mimicking Claude's project layout
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-test-'));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('parseJsonlSessions', () => {
    it('should parse sessions from JSONL file', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', type: 'message', message: { role: 'user', content: 'Hello' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'session-1', type: 'message', message: { role: 'assistant', content: 'Hi there!' }, timestamp: '2024-01-01T00:00:01Z' },
        { sessionId: 'session-2', type: 'message', message: { role: 'user', content: 'Different session' }, timestamp: '2024-01-01T00:01:00Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions).toHaveLength(2);
      expect(result.entries).toHaveLength(3);

      const session1 = result.sessions.find(s => s.id === 'session-1');
      expect(session1).toBeDefined();
      expect(session1.messageCount).toBe(2);
    });

    it('should extract summary from summary entries', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', type: 'message', message: { role: 'user', content: 'Hello' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'session-1', type: 'summary', summary: 'Test summary here', timestamp: '2024-01-01T00:00:01Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions[0].summary).toBe('Test summary here');
    });

    it('should track last user and assistant messages', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', message: { role: 'user', content: 'First user message' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'session-1', message: { role: 'assistant', content: 'First assistant message' }, timestamp: '2024-01-01T00:00:01Z' },
        { sessionId: 'session-1', message: { role: 'user', content: 'Last user message' }, timestamp: '2024-01-01T00:00:02Z' },
        { sessionId: 'session-1', message: { role: 'assistant', content: 'Last assistant message' }, timestamp: '2024-01-01T00:00:03Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions[0].lastUserMessage).toBe('Last user message');
      expect(result.sessions[0].lastAssistantMessage).toBe('Last assistant message');
    });

    it('should filter out system messages from lastUserMessage', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', message: { role: 'user', content: 'Real user message' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'session-1', message: { role: 'user', content: '<system-reminder>This is a system reminder</system-reminder>' }, timestamp: '2024-01-01T00:00:01Z' },
        { sessionId: 'session-1', message: { role: 'user', content: '<command-name>test</command-name>' }, timestamp: '2024-01-01T00:00:02Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      // Last real user message should be the first one (others are filtered)
      expect(result.sessions[0].lastUserMessage).toBe('Real user message');
    });

    it('should filter out "Warmup" messages', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', message: { role: 'user', content: 'Warmup' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'session-1', message: { role: 'user', content: 'Real message' }, timestamp: '2024-01-01T00:00:01Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions[0].lastUserMessage).toBe('Real message');
    });

    it('should handle empty file', async () => {
      const jsonlFile = path.join(tempDir, 'empty.jsonl');
      fs.writeFileSync(jsonlFile, '');

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions).toHaveLength(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should skip malformed JSON lines', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const content = '{"sessionId": "session-1", "message": {"role": "user", "content": "Hello"}}\nthis is not json\n{"sessionId": "session-1", "message": {"role": "assistant", "content": "Hi"}}';
      fs.writeFileSync(jsonlFile, content);

      const result = await parseJsonlSessions(jsonlFile);

      // Should still parse the valid entries
      expect(result.entries.length).toBe(2);
    });

    it('should handle non-existent file', async () => {
      const result = await parseJsonlSessions('/nonexistent/path/file.jsonl');

      expect(result.sessions).toHaveLength(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should filter out sessions with JSON summaries (Task Master errors)', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'good-session', message: { role: 'user', content: 'Normal message' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'bad-session', message: { role: 'user', content: '{ "subtasks": [...] }' }, timestamp: '2024-01-01T00:01:00Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      // Should include good session but summary for bad session is filtered
      const goodSession = result.sessions.find(s => s.id === 'good-session');
      expect(goodSession).toBeDefined();
    });

    it('should handle array content format', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', message: { role: 'user', content: [{ type: 'text', text: 'Array format message' }] }, timestamp: '2024-01-01T00:00:00Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions[0].lastUserMessage).toBe('Array format message');
    });

    it('should skip API error messages', async () => {
      const jsonlFile = path.join(tempDir, 'test.jsonl');
      const entries = [
        { sessionId: 'session-1', message: { role: 'assistant', content: 'Real response' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'session-1', isApiErrorMessage: true, message: { role: 'assistant', content: 'API Error message' }, timestamp: '2024-01-01T00:00:01Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await parseJsonlSessions(jsonlFile);

      expect(result.sessions[0].lastAssistantMessage).toBe('Real response');
    });
  });

  describe('getSessionMessages', () => {
    let projectPath;

    beforeEach(() => {
      // Create a mock project folder structure
      projectPath = '/test/project';
      const encodedPath = projectPath.replace(/\//g, '-').replace(/_/g, '-');
      claudeProjectDir = path.join(os.homedir(), '.claude', 'projects', encodedPath);

      // Create the directory structure
      fs.mkdirSync(claudeProjectDir, { recursive: true });
    });

    afterEach(() => {
      // Clean up Claude project directory
      if (claudeProjectDir && fs.existsSync(claudeProjectDir)) {
        fs.rmSync(claudeProjectDir, { recursive: true, force: true });
      }
    });

    it('should return messages for a specific session', async () => {
      const jsonlFile = path.join(claudeProjectDir, 'conversation.jsonl');
      const entries = [
        { sessionId: 'target-session', message: { role: 'user', content: 'Hello' }, timestamp: '2024-01-01T00:00:00Z' },
        { sessionId: 'other-session', message: { role: 'user', content: 'Other' }, timestamp: '2024-01-01T00:00:01Z' },
        { sessionId: 'target-session', message: { role: 'assistant', content: 'Hi!' }, timestamp: '2024-01-01T00:00:02Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await getSessionMessages('target-session', projectPath);

      // Without limit, returns array
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('target-session');
      expect(result[1].sessionId).toBe('target-session');
    });

    it('should return paginated messages when limit is provided', async () => {
      const jsonlFile = path.join(claudeProjectDir, 'conversation.jsonl');
      const entries = [];
      for (let i = 0; i < 10; i++) {
        entries.push({ sessionId: 'session-1', message: { role: 'user', content: `Message ${i}` }, timestamp: `2024-01-01T00:00:${i.toString().padStart(2, '0')}Z` });
      }
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await getSessionMessages('session-1', projectPath, 5, 0);

      expect(result.messages).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty result when session not found', async () => {
      const jsonlFile = path.join(claudeProjectDir, 'conversation.jsonl');
      fs.writeFileSync(jsonlFile, JSON.stringify({ sessionId: 'other', message: {} }));

      const result = await getSessionMessages('nonexistent-session', projectPath, 10, 0);

      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should return empty result when project directory does not exist', async () => {
      // Remove the project dir
      fs.rmSync(claudeProjectDir, { recursive: true, force: true });

      const result = await getSessionMessages('session-1', projectPath, 10, 0);

      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should skip agent-*.jsonl files', async () => {
      // Regular file with messages
      const regularFile = path.join(claudeProjectDir, 'conversation.jsonl');
      fs.writeFileSync(regularFile, JSON.stringify({ sessionId: 'session-1', message: { role: 'user', content: 'Regular' }, timestamp: '2024-01-01T00:00:00Z' }));

      // Agent file that should be skipped
      const agentFile = path.join(claudeProjectDir, 'agent-123.jsonl');
      fs.writeFileSync(agentFile, JSON.stringify({ sessionId: 'session-1', message: { role: 'user', content: 'Agent' }, timestamp: '2024-01-01T00:00:01Z' }));

      const result = await getSessionMessages('session-1', projectPath);

      // Should only have message from regular file, not agent file
      expect(result).toHaveLength(1);
      expect(result[0].message.content).toBe('Regular');
    });

    it('should sort messages by timestamp', async () => {
      const jsonlFile = path.join(claudeProjectDir, 'conversation.jsonl');
      const entries = [
        { sessionId: 'session-1', message: { content: 'Third' }, timestamp: '2024-01-01T00:00:03Z' },
        { sessionId: 'session-1', message: { content: 'First' }, timestamp: '2024-01-01T00:00:01Z' },
        { sessionId: 'session-1', message: { content: 'Second' }, timestamp: '2024-01-01T00:00:02Z' }
      ];
      fs.writeFileSync(jsonlFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await getSessionMessages('session-1', projectPath);

      expect(result[0].message.content).toBe('First');
      expect(result[1].message.content).toBe('Second');
      expect(result[2].message.content).toBe('Third');
    });
  });
});
