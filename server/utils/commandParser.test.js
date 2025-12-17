import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseCommand,
  replaceArguments,
  isPathSafe,
  processFileIncludes,
  validateCommand,
  isBashCommandAllowed,
  sanitizeOutput,
  processBashCommands
} from './commandParser.js';

describe('commandParser utility', () => {
  describe('parseCommand', () => {
    it('should parse markdown with frontmatter', () => {
      const content = `---
name: test
description: A test command
---

# Test Content

This is the body.`;

      const result = parseCommand(content);

      expect(result.data.name).toBe('test');
      expect(result.data.description).toBe('A test command');
      expect(result.content).toContain('# Test Content');
      expect(result.content).toContain('This is the body.');
    });

    it('should handle content without frontmatter', () => {
      const content = '# Just Content\n\nNo frontmatter here.';

      const result = parseCommand(content);

      expect(result.data).toEqual({});
      expect(result.content).toContain('# Just Content');
    });

    it('should handle empty content', () => {
      const result = parseCommand('');

      expect(result.data).toEqual({});
      expect(result.content).toBe('');
    });
  });

  describe('replaceArguments', () => {
    it('should replace $ARGUMENTS with all arguments', () => {
      const content = 'Run command with: $ARGUMENTS';
      const args = ['arg1', 'arg2', 'arg3'];

      const result = replaceArguments(content, args);

      expect(result).toBe('Run command with: arg1 arg2 arg3');
    });

    it('should replace positional arguments $1-$9', () => {
      const content = 'First: $1, Second: $2, Third: $3';
      const args = ['one', 'two', 'three'];

      const result = replaceArguments(content, args);

      expect(result).toBe('First: one, Second: two, Third: three');
    });

    it('should handle string args by converting to array', () => {
      const content = 'Arg: $1, All: $ARGUMENTS';
      const args = 'single-arg';

      const result = replaceArguments(content, args);

      expect(result).toBe('Arg: single-arg, All: single-arg');
    });

    it('should replace missing positional args with empty string', () => {
      const content = 'First: $1, Second: $2';
      const args = ['only-one'];

      const result = replaceArguments(content, args);

      expect(result).toBe('First: only-one, Second: ');
    });

    it('should handle null/undefined content', () => {
      expect(replaceArguments(null, ['arg'])).toBeNull();
      expect(replaceArguments(undefined, ['arg'])).toBeUndefined();
    });

    it('should handle empty args', () => {
      const content = 'No args: $ARGUMENTS';

      const result = replaceArguments(content, []);

      expect(result).toBe('No args: ');
    });
  });

  describe('isPathSafe', () => {
    it('should allow safe relative paths', () => {
      expect(isPathSafe('file.txt', '/base')).toBe(true);
      expect(isPathSafe('subdir/file.txt', '/base')).toBe(true);
      expect(isPathSafe('./file.txt', '/base')).toBe(true);
    });

    it('should reject directory traversal attempts', () => {
      expect(isPathSafe('../file.txt', '/base')).toBe(false);
      expect(isPathSafe('subdir/../../../etc/passwd', '/base')).toBe(false);
      expect(isPathSafe('../../sensitive.txt', '/base')).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(isPathSafe('/etc/passwd', '/base')).toBe(false);
      expect(isPathSafe('/root/.ssh/id_rsa', '/base')).toBe(false);
    });

    it('should reject empty paths', () => {
      expect(isPathSafe('', '/base')).toBe(false);
    });
  });

  describe('validateCommand', () => {
    it('should allow commands in the allowlist', () => {
      expect(validateCommand('echo hello').allowed).toBe(true);
      expect(validateCommand('ls -la').allowed).toBe(true);
      expect(validateCommand('git status').allowed).toBe(true);
      expect(validateCommand('npm install').allowed).toBe(true);
    });

    it('should reject commands not in the allowlist', () => {
      const result = validateCommand('rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('not in the allowlist');
    });

    it('should reject shell operators', () => {
      expect(validateCommand('echo hello && rm -rf /').allowed).toBe(false);
      expect(validateCommand('cat file | grep test').allowed).toBe(false);
      expect(validateCommand('ls; rm -rf /').allowed).toBe(false);
    });

    it('should reject empty commands', () => {
      expect(validateCommand('').allowed).toBe(false);
      expect(validateCommand('   ').allowed).toBe(false);
    });

    it('should reject shell substitution patterns', () => {
      // $(whoami) is caught as a shell operator by shell-quote
      const result = validateCommand('echo $(whoami)');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Shell operators');
    });

    it('should reject commands with dangerous characters in arguments', () => {
      // Use a string that passes shell-quote parsing but has dangerous chars
      // shell-quote will parse this as: ['echo', ';', 'rm'] which contains operator
      const result = validateCommand('echo hello;rm');
      expect(result.allowed).toBe(false);
      // Either caught as operator or dangerous characters
      expect(result.allowed).toBe(false);
    });

    it('should handle commands with quoted arguments', () => {
      const result = validateCommand('echo "hello world"');
      expect(result.allowed).toBe(true);
      expect(result.args).toContain('hello world');
    });

    it('should extract command and args correctly', () => {
      const result = validateCommand('git commit -m "test message"');
      expect(result.allowed).toBe(true);
      expect(result.command).toBe('git');
      expect(result.args).toContain('commit');
      expect(result.args).toContain('-m');
      expect(result.args).toContain('test message');
    });
  });

  describe('isBashCommandAllowed', () => {
    it('should return true for allowed commands', () => {
      expect(isBashCommandAllowed('echo hello')).toBe(true);
      expect(isBashCommandAllowed('pwd')).toBe(true);
    });

    it('should return false for disallowed commands', () => {
      expect(isBashCommandAllowed('rm file.txt')).toBe(false);
      expect(isBashCommandAllowed('curl http://example.com')).toBe(false);
    });
  });

  describe('sanitizeOutput', () => {
    it('should preserve normal text', () => {
      expect(sanitizeOutput('Hello World')).toBe('Hello World');
    });

    it('should preserve tabs, newlines, and carriage returns', () => {
      expect(sanitizeOutput('Line1\nLine2\tTabbed\rReturn')).toBe('Line1\nLine2\tTabbed\rReturn');
    });

    it('should remove control characters', () => {
      const input = 'Normal\x00Hidden\x07Bell\x1BEscape';
      const result = sanitizeOutput(input);
      expect(result).toBe('NormalHiddenBellEscape');
    });

    it('should handle empty input', () => {
      expect(sanitizeOutput('')).toBe('');
      expect(sanitizeOutput(null)).toBe('');
      expect(sanitizeOutput(undefined)).toBe('');
    });
  });

  describe('processFileIncludes', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commandparser-test-'));
    });

    afterEach(() => {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should include file contents with @filename syntax', async () => {
      fs.writeFileSync(path.join(tempDir, 'included.txt'), 'Included content');
      const content = 'Before @included.txt After';

      const result = await processFileIncludes(content, tempDir);

      expect(result).toContain('Included content');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('should handle nested includes', async () => {
      fs.writeFileSync(path.join(tempDir, 'level1.txt'), 'Level1 @level2.txt');
      fs.writeFileSync(path.join(tempDir, 'level2.txt'), 'Level2 content');
      const content = '@level1.txt';

      const result = await processFileIncludes(content, tempDir);

      expect(result).toContain('Level1');
      expect(result).toContain('Level2 content');
    });

    it('should reject directory traversal', async () => {
      const content = '@../etc/passwd';

      await expect(processFileIncludes(content, tempDir)).rejects.toThrow('directory traversal');
    });

    it('should throw on max include depth exceeded', async () => {
      // Create a chain of files that exceeds max depth
      fs.writeFileSync(path.join(tempDir, 'a.txt'), '@b.txt');
      fs.writeFileSync(path.join(tempDir, 'b.txt'), '@c.txt');
      fs.writeFileSync(path.join(tempDir, 'c.txt'), '@d.txt');
      fs.writeFileSync(path.join(tempDir, 'd.txt'), '@e.txt'); // This should exceed depth 3

      await expect(processFileIncludes('@a.txt', tempDir)).rejects.toThrow('Maximum include depth');
    });

    it('should throw on file not found', async () => {
      const content = '@nonexistent.txt';

      await expect(processFileIncludes(content, tempDir)).rejects.toThrow('File not found');
    });

    it('should return content unchanged when no includes', async () => {
      const content = 'No includes here';

      const result = await processFileIncludes(content, tempDir);

      expect(result).toBe('No includes here');
    });

    it('should handle null/empty content', async () => {
      expect(await processFileIncludes(null, tempDir)).toBeNull();
      expect(await processFileIncludes('', tempDir)).toBe('');
    });
  });

  describe('processBashCommands', () => {
    it('should execute allowed bash commands', async () => {
      const content = 'Date is:\n!date +%Y';

      const result = await processBashCommands(content);

      // Should contain the year (4 digits)
      expect(result).toMatch(/\d{4}/);
    });

    it('should execute echo command', async () => {
      const content = '!echo hello world';

      const result = await processBashCommands(content);

      expect(result).toContain('hello world');
    });

    it('should reject disallowed commands', async () => {
      const content = '!rm -rf /';

      await expect(processBashCommands(content)).rejects.toThrow('Command not allowed');
    });

    it('should return content unchanged when no commands', async () => {
      const content = 'No commands here';

      const result = await processBashCommands(content);

      expect(result).toBe('No commands here');
    });

    it('should handle null/empty content', async () => {
      expect(await processBashCommands(null)).toBeNull();
      expect(await processBashCommands('')).toBe('');
    });
  });
});
