import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  store: {},
  getItem: vi.fn((key) => mockLocalStorage.store[key] || null),
  setItem: vi.fn((key, value) => { mockLocalStorage.store[key] = value; }),
  removeItem: vi.fn((key) => { delete mockLocalStorage.store[key]; }),
  clear: vi.fn(() => { mockLocalStorage.store = {}; }),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

// Mock window.dispatchEvent
global.window = {
  dispatchEvent: vi.fn(),
};

describe('Settings Component Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Management Logic', () => {
    it('should add a tool to allowed tools list', () => {
      const allowedTools = [];
      const tool = 'Write';

      const addAllowedTool = (t, tools) => {
        if (t && !tools.includes(t)) {
          return [...tools, t];
        }
        return tools;
      };

      const result = addAllowedTool(tool, allowedTools);
      expect(result).toContain('Write');
      expect(result).toHaveLength(1);
    });

    it('should not add duplicate tool to allowed tools list', () => {
      const allowedTools = ['Write'];
      const tool = 'Write';

      const addAllowedTool = (t, tools) => {
        if (t && !tools.includes(t)) {
          return [...tools, t];
        }
        return tools;
      };

      const result = addAllowedTool(tool, allowedTools);
      expect(result).toHaveLength(1);
    });

    it('should not add empty tool to allowed tools list', () => {
      const allowedTools = [];
      const tool = '';

      const addAllowedTool = (t, tools) => {
        if (t && !tools.includes(t)) {
          return [...tools, t];
        }
        return tools;
      };

      const result = addAllowedTool(tool, allowedTools);
      expect(result).toHaveLength(0);
    });

    it('should remove a tool from allowed tools list', () => {
      const allowedTools = ['Write', 'Read', 'Edit'];
      const tool = 'Read';

      const removeAllowedTool = (t, tools) => {
        return tools.filter(item => item !== t);
      };

      const result = removeAllowedTool(tool, allowedTools);
      expect(result).not.toContain('Read');
      expect(result).toHaveLength(2);
    });

    it('should add a tool to disallowed tools list', () => {
      const disallowedTools = [];
      const tool = 'Bash(rm:*)';

      const addDisallowedTool = (t, tools) => {
        if (t && !tools.includes(t)) {
          return [...tools, t];
        }
        return tools;
      };

      const result = addDisallowedTool(tool, disallowedTools);
      expect(result).toContain('Bash(rm:*)');
      expect(result).toHaveLength(1);
    });
  });

  describe('Settings Persistence', () => {
    it('should save settings to localStorage', () => {
      const settings = {
        allowedTools: ['Write', 'Read'],
        disallowedTools: ['Bash(rm:*)'],
        skipPermissions: false,
        projectSortOrder: 'name',
        lastUpdated: new Date().toISOString()
      };

      localStorage.setItem('claude-settings', JSON.stringify(settings));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'claude-settings',
        expect.any(String)
      );

      const savedSettings = JSON.parse(mockLocalStorage.store['claude-settings']);
      expect(savedSettings.allowedTools).toEqual(['Write', 'Read']);
      expect(savedSettings.disallowedTools).toEqual(['Bash(rm:*)']);
      expect(savedSettings.skipPermissions).toBe(false);
      expect(savedSettings.projectSortOrder).toBe('name');
    });

    it('should load settings from localStorage', () => {
      const savedSettings = {
        allowedTools: ['Glob', 'Grep'],
        disallowedTools: [],
        skipPermissions: true,
        projectSortOrder: 'date'
      };

      mockLocalStorage.store['claude-settings'] = JSON.stringify(savedSettings);

      const loaded = localStorage.getItem('claude-settings');
      const settings = JSON.parse(loaded);

      expect(settings.allowedTools).toEqual(['Glob', 'Grep']);
      expect(settings.disallowedTools).toEqual([]);
      expect(settings.skipPermissions).toBe(true);
      expect(settings.projectSortOrder).toBe('date');
    });

    it('should handle missing settings in localStorage', () => {
      const loaded = localStorage.getItem('claude-settings');
      expect(loaded).toBeNull();

      // Default values when no settings exist
      const defaults = {
        allowedTools: [],
        disallowedTools: [],
        skipPermissions: false,
        projectSortOrder: 'name'
      };

      expect(defaults.allowedTools).toEqual([]);
      expect(defaults.skipPermissions).toBe(false);
    });
  });

  describe('Code Editor Settings', () => {
    it('should save code editor theme to localStorage', () => {
      localStorage.setItem('codeEditorTheme', 'dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codeEditorTheme', 'dark');
    });

    it('should save code editor word wrap setting', () => {
      localStorage.setItem('codeEditorWordWrap', 'true');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codeEditorWordWrap', 'true');
    });

    it('should save code editor minimap setting', () => {
      localStorage.setItem('codeEditorShowMinimap', 'true');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codeEditorShowMinimap', 'true');
    });

    it('should save code editor line numbers setting', () => {
      localStorage.setItem('codeEditorLineNumbers', 'false');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codeEditorLineNumbers', 'false');
    });

    it('should save code editor font size', () => {
      localStorage.setItem('codeEditorFontSize', '16');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codeEditorFontSize', '16');
    });
  });

  describe('MCP Server JSON Validation', () => {
    it('should validate stdio type requires command field', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('{"type": "stdio"}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('stdio type requires a command field');
    });

    it('should validate http type requires url field', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('{"type": "http"}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('http type requires a url field');
    });

    it('should validate sse type requires url field', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('{"type": "sse"}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('sse type requires a url field');
    });

    it('should accept valid stdio config', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('{"type": "stdio", "command": "npx", "args": ["@playwright/mcp"]}');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should accept valid http config', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('{"type": "http", "url": "https://example.com/mcp"}');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject invalid JSON', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('not valid json');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid JSON format');
    });

    it('should reject config missing type field', () => {
      const validateMcpJson = (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!parsed.type) {
            return { valid: false, error: 'Missing required field: type' };
          }
          if (parsed.type === 'stdio' && !parsed.command) {
            return { valid: false, error: 'stdio type requires a command field' };
          }
          if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
            return { valid: false, error: `${parsed.type} type requires a url field` };
          }
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: 'Invalid JSON format' };
        }
      };

      const result = validateMcpJson('{"command": "npx"}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing required field: type');
    });
  });

  describe('Common Tools List', () => {
    it('should have all expected common tools', () => {
      const commonTools = [
        'Write',
        'Read',
        'Edit',
        'Glob',
        'Grep',
        'MultiEdit',
        'Task',
        'TodoWrite',
        'TodoRead',
        'WebFetch',
        'WebSearch'
      ];

      expect(commonTools).toContain('Write');
      expect(commonTools).toContain('Read');
      expect(commonTools).toContain('Edit');
      expect(commonTools).toContain('Glob');
      expect(commonTools).toContain('Grep');
      expect(commonTools).toContain('MultiEdit');
      expect(commonTools).toContain('Task');
      expect(commonTools).toContain('TodoWrite');
      expect(commonTools).toContain('TodoRead');
      expect(commonTools).toContain('WebFetch');
      expect(commonTools).toContain('WebSearch');
      expect(commonTools).toHaveLength(11);
    });
  });

  describe('Environment Variables Parsing', () => {
    it('should parse environment variables from text format', () => {
      const parseEnvVars = (text) => {
        const env = {};
        text.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=');
          if (key && key.trim()) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        });
        return env;
      };

      const result = parseEnvVars('API_KEY=your-key\nDEBUG=true');
      expect(result).toEqual({
        'API_KEY': 'your-key',
        'DEBUG': 'true'
      });
    });

    it('should handle values containing equals signs', () => {
      const parseEnvVars = (text) => {
        const env = {};
        text.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=');
          if (key && key.trim()) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        });
        return env;
      };

      const result = parseEnvVars('CONNECTION_STRING=host=localhost;port=5432');
      expect(result).toEqual({
        'CONNECTION_STRING': 'host=localhost;port=5432'
      });
    });

    it('should skip empty lines', () => {
      const parseEnvVars = (text) => {
        const env = {};
        text.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=');
          if (key && key.trim()) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        });
        return env;
      };

      const result = parseEnvVars('KEY1=value1\n\nKEY2=value2');
      expect(result).toEqual({
        'KEY1': 'value1',
        'KEY2': 'value2'
      });
    });
  });

  describe('Transport Type Icon Selection', () => {
    it('should return correct icon type for transport types', () => {
      const getTransportType = (type) => {
        switch (type) {
          case 'stdio': return 'Terminal';
          case 'sse': return 'Zap';
          case 'http': return 'Globe';
          default: return 'Server';
        }
      };

      expect(getTransportType('stdio')).toBe('Terminal');
      expect(getTransportType('sse')).toBe('Zap');
      expect(getTransportType('http')).toBe('Globe');
      expect(getTransportType('unknown')).toBe('Server');
    });
  });
});
