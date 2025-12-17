import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  _mapCliOptionsToSDK as mapCliOptionsToSDK,
  _extractTokenBudget as extractTokenBudget,
  _handleImages as handleImages,
  _cleanupTempFiles as cleanupTempFiles,
  _transformMessage as transformMessage
} from './claude-sdk.js';

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

describe('extractTokenBudget', () => {
  it('should return null for non-result messages', () => {
    const message = { type: 'message', content: 'Hello' };

    const result = extractTokenBudget(message);

    expect(result).toBeNull();
  });

  it('should return null when no modelUsage', () => {
    const message = { type: 'result' };

    const result = extractTokenBudget(message);

    expect(result).toBeNull();
  });

  it('should extract token usage from result message', () => {
    const message = {
      type: 'result',
      modelUsage: {
        'claude-3-sonnet': {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 100,
          cacheCreationInputTokens: 50
        }
      }
    };

    const result = extractTokenBudget(message);

    expect(result).toBeDefined();
    expect(result.used).toBe(1650); // 1000 + 500 + 100 + 50
    expect(result.total).toBe(160000); // default context window
  });

  it('should use cumulative tokens when available', () => {
    const message = {
      type: 'result',
      modelUsage: {
        'claude-3-sonnet': {
          inputTokens: 100,
          outputTokens: 50,
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500,
          cumulativeCacheReadInputTokens: 200,
          cumulativeCacheCreationInputTokens: 100
        }
      }
    };

    const result = extractTokenBudget(message);

    expect(result.used).toBe(1800); // cumulative values: 1000 + 500 + 200 + 100
  });

  it('should handle missing token fields', () => {
    const message = {
      type: 'result',
      modelUsage: {
        'claude-3-sonnet': {}
      }
    };

    const result = extractTokenBudget(message);

    expect(result.used).toBe(0);
  });
});

describe('transformMessage', () => {
  it('should return the message unchanged (pass-through)', () => {
    const message = { type: 'message', content: 'Test' };

    const result = transformMessage(message);

    expect(result).toEqual(message);
  });
});

describe('handleImages', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-sdk-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return original command when no images', async () => {
    const command = 'Hello Claude';

    const result = await handleImages(command, [], tempDir);

    expect(result.modifiedCommand).toBe('Hello Claude');
    expect(result.tempImagePaths).toHaveLength(0);
    expect(result.tempDir).toBeNull();
  });

  it('should return original command when images is null', async () => {
    const command = 'Hello Claude';

    const result = await handleImages(command, null, tempDir);

    expect(result.modifiedCommand).toBe('Hello Claude');
    expect(result.tempImagePaths).toHaveLength(0);
  });

  it('should save base64 image to temp file', async () => {
    const command = 'Describe this image';
    // Create a simple 1x1 pixel PNG in base64
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const images = [{ data: base64Image }];

    const result = await handleImages(command, images, tempDir);

    expect(result.tempImagePaths).toHaveLength(1);
    expect(fs.existsSync(result.tempImagePaths[0])).toBe(true);
    expect(result.modifiedCommand).toContain('Describe this image');
    expect(result.modifiedCommand).toContain('[Images provided');
    expect(result.tempDir).toBeDefined();
  });

  it('should handle multiple images', async () => {
    const command = 'Compare these images';
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const images = [{ data: base64Image }, { data: base64Image }];

    const result = await handleImages(command, images, tempDir);

    expect(result.tempImagePaths).toHaveLength(2);
    expect(result.modifiedCommand).toContain('1.');
    expect(result.modifiedCommand).toContain('2.');
  });

  it('should skip invalid image data format', async () => {
    const command = 'Test';
    const images = [{ data: 'invalid-not-base64' }];

    const result = await handleImages(command, images, tempDir);

    expect(result.tempImagePaths).toHaveLength(0);
  });
});

describe('cleanupTempFiles', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cleanup-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should do nothing when tempImagePaths is empty', async () => {
    await cleanupTempFiles([], tempDir);
    // Should not throw
    expect(true).toBe(true);
  });

  it('should do nothing when tempImagePaths is null', async () => {
    await cleanupTempFiles(null, tempDir);
    // Should not throw
    expect(true).toBe(true);
  });

  it('should delete temp files and directory', async () => {
    // Create temp files
    const file1 = path.join(tempDir, 'image1.png');
    const file2 = path.join(tempDir, 'image2.png');
    fs.writeFileSync(file1, 'fake image data');
    fs.writeFileSync(file2, 'fake image data');

    await cleanupTempFiles([file1, file2], tempDir);

    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);
    expect(fs.existsSync(tempDir)).toBe(false);
  });

  it('should handle non-existent files gracefully', async () => {
    const nonExistentFile = path.join(tempDir, 'nonexistent.png');

    // Should not throw
    await cleanupTempFiles([nonExistentFile], tempDir);
    expect(true).toBe(true);
  });
});
