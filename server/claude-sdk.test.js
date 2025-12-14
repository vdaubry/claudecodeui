import { describe, it, expect } from 'vitest';
import { _mapCliOptionsToSDK as mapCliOptionsToSDK } from './claude-sdk.js';

describe('mapCliOptionsToSDK', () => {
  describe('basic options mapping', () => {
    it('should return empty sdkOptions for empty input', () => {
      const result = mapCliOptionsToSDK({});
      expect(result.model).toBe('sonnet');
      expect(result.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code'
      });
      expect(result.settingSources).toEqual(['project', 'user', 'local']);
    });

    it('should map cwd option', () => {
      const result = mapCliOptionsToSDK({ cwd: '/path/to/project' });
      expect(result.cwd).toBe('/path/to/project');
    });

    it('should map sessionId to resume option', () => {
      const result = mapCliOptionsToSDK({ sessionId: 'session-123' });
      expect(result.resume).toBe('session-123');
    });

    it('should map custom model', () => {
      const result = mapCliOptionsToSDK({ model: 'opus' });
      expect(result.model).toBe('opus');
    });

    it('should default to sonnet model when not specified', () => {
      const result = mapCliOptionsToSDK({});
      expect(result.model).toBe('sonnet');
    });
  });

  describe('permission mode mapping', () => {
    it('should not map default permission mode', () => {
      const result = mapCliOptionsToSDK({ permissionMode: 'default' });
      expect(result.permissionMode).toBeUndefined();
    });

    it('should map plan permission mode', () => {
      const result = mapCliOptionsToSDK({ permissionMode: 'plan' });
      expect(result.permissionMode).toBe('plan');
      expect(result.allowedTools).toContain('Read');
      expect(result.allowedTools).toContain('Task');
      expect(result.allowedTools).toContain('exit_plan_mode');
      expect(result.allowedTools).toContain('TodoRead');
      expect(result.allowedTools).toContain('TodoWrite');
    });

    it('should use bypassPermissions mode when skipPermissions is true', () => {
      const result = mapCliOptionsToSDK({
        toolsSettings: { skipPermissions: true }
      });
      expect(result.permissionMode).toBe('bypassPermissions');
    });

    it('should not use bypassPermissions in plan mode even with skipPermissions', () => {
      const result = mapCliOptionsToSDK({
        permissionMode: 'plan',
        toolsSettings: { skipPermissions: true }
      });
      expect(result.permissionMode).toBe('plan');
    });
  });

  describe('tools settings mapping', () => {
    it('should map allowed tools', () => {
      const result = mapCliOptionsToSDK({
        toolsSettings: {
          allowedTools: ['Read', 'Write'],
          disallowedTools: [],
          skipPermissions: false
        }
      });
      expect(result.allowedTools).toContain('Read');
      expect(result.allowedTools).toContain('Write');
    });

    it('should map disallowed tools', () => {
      const result = mapCliOptionsToSDK({
        toolsSettings: {
          allowedTools: [],
          disallowedTools: ['Bash', 'Write'],
          skipPermissions: false
        }
      });
      expect(result.disallowedTools).toContain('Bash');
      expect(result.disallowedTools).toContain('Write');
    });

    it('should merge plan mode tools with allowed tools', () => {
      const result = mapCliOptionsToSDK({
        permissionMode: 'plan',
        toolsSettings: {
          allowedTools: ['CustomTool'],
          disallowedTools: [],
          skipPermissions: false
        }
      });
      expect(result.allowedTools).toContain('CustomTool');
      expect(result.allowedTools).toContain('Read');
      expect(result.allowedTools).toContain('Task');
    });
  });

  describe('system prompt mapping', () => {
    it('should use preset type when no customSystemPrompt', () => {
      const result = mapCliOptionsToSDK({});
      expect(result.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code'
      });
    });

    it('should use preset type with append when customSystemPrompt is provided', () => {
      const customPrompt = '## Project Context\n\nThis is a test project.';
      const result = mapCliOptionsToSDK({ customSystemPrompt: customPrompt });
      expect(result.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: customPrompt
      });
    });

    it('should handle empty customSystemPrompt', () => {
      const result = mapCliOptionsToSDK({ customSystemPrompt: '' });
      expect(result.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code'
      });
    });

    it('should preserve customSystemPrompt content exactly', () => {
      const customPrompt = `## Project Context

My project description.

## Task Context

The task to implement:
- Feature A
- Feature B`;
      const result = mapCliOptionsToSDK({ customSystemPrompt: customPrompt });
      expect(result.systemPrompt.append).toBe(customPrompt);
    });
  });

  describe('combined options', () => {
    it('should correctly map multiple options together', () => {
      const options = {
        cwd: '/path/to/repo',
        sessionId: 'session-456',
        model: 'opus',
        permissionMode: 'plan',
        customSystemPrompt: '## Task\nImplement feature X',
        toolsSettings: {
          allowedTools: ['Read'],
          disallowedTools: [],
          skipPermissions: false
        }
      };

      const result = mapCliOptionsToSDK(options);

      expect(result.cwd).toBe('/path/to/repo');
      expect(result.resume).toBe('session-456');
      expect(result.model).toBe('opus');
      expect(result.permissionMode).toBe('plan');
      expect(result.systemPrompt.type).toBe('preset');
      expect(result.systemPrompt.append).toBe('## Task\nImplement feature X');
      expect(result.allowedTools).toContain('Read');
      expect(result.allowedTools).toContain('Task');
      expect(result.settingSources).toEqual(['project', 'user', 'local']);
    });
  });
});
