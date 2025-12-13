#!/usr/bin/env node
// Load environment variables from .env file
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    ok: (text) => `${colors.green}${text}${colors.reset}`,
    warn: (text) => `${colors.yellow}${text}${colors.reset}`,
    tip: (text) => `${colors.blue}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

try {
    const envPath = path.join(__dirname, '../.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0 && !process.env[key]) {
                process.env[key] = valueParts.join('=').trim();
            }
        }
    });
} catch (e) {
    console.log('No .env file found or error reading it:', e.message);
}

console.log('PORT from env:', process.env.PORT);

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';
import http from 'http';
import cors from 'cors';
import { promises as fsPromises } from 'fs';
import { spawn } from 'child_process';
import pty from 'node-pty';
import fetch from 'node-fetch';
import mime from 'mime-types';

import { queryClaudeSDK, abortClaudeSDKSession, isClaudeSDKSessionActive, getActiveClaudeSDKSessions } from './claude-sdk.js';
import gitRoutes from './routes/git.js';
import authRoutes from './routes/auth.js';
import mcpRoutes from './routes/mcp.js';
import commandsRoutes from './routes/commands.js';
import settingsRoutes from './routes/settings.js';
import agentRoutes from './routes/agent.js';
import cliAuthRoutes from './routes/cli-auth.js';
import userRoutes from './routes/user.js';
import projectsRoutes from './routes/projects.js';
import tasksRoutes from './routes/tasks.js';
import conversationsRoutes from './routes/conversations.js';
import { initializeDatabase, projectsDb, tasksDb, conversationsDb } from './database/db.js';
import { buildContextPrompt } from './services/documentation.js';
import { validateApiKey, authenticateToken, authenticateWebSocket } from './middleware/auth.js';

// Track which session each client is subscribed to for targeted message delivery
const clientSubscriptions = new Map(); // Map<WebSocket, { sessionId: string | null, provider: string }>


const app = express();
const server = http.createServer(app);

const ptySessionsMap = new Map();
const PTY_SESSION_TIMEOUT = 30 * 60 * 1000;

// Single WebSocket server that handles both paths
const wss = new WebSocketServer({
    server,
    verifyClient: (info) => {
        console.log('WebSocket connection attempt to:', info.req.url);

        // Platform mode: always allow connection
        if (process.env.VITE_IS_PLATFORM === 'true') {
            const user = authenticateWebSocket(null); // Will return first user
            if (!user) {
                console.log('[WARN] Platform mode: No user found in database');
                return false;
            }
            info.req.user = user;
            console.log('[OK] Platform mode WebSocket authenticated for user:', user.username);
            return true;
        }

        // Normal mode: verify token
        // Extract token from query parameters or headers
        const url = new URL(info.req.url, 'http://localhost');
        const token = url.searchParams.get('token') ||
            info.req.headers.authorization?.split(' ')[1];

        // Verify token
        const user = authenticateWebSocket(token);
        if (!user) {
            console.log('[WARN] WebSocket authentication failed');
            return false;
        }

        // Store user info in the request for later use
        info.req.user = user;
        console.log('[OK] WebSocket authenticated for user:', user.username);
        return true;
    }
});

// Make WebSocket server available to routes
app.locals.wss = wss;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Public health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Optional API key validation (if configured)
app.use('/api', validateApiKey);

// Authentication routes (public)
app.use('/api/auth', authRoutes);

// Git API Routes (protected)
app.use('/api/git', authenticateToken, gitRoutes);

// MCP API Routes (protected)
app.use('/api/mcp', authenticateToken, mcpRoutes);

// Commands API Routes (protected)
app.use('/api/commands', authenticateToken, commandsRoutes);

// Settings API Routes (protected)
app.use('/api/settings', authenticateToken, settingsRoutes);

// CLI Authentication API Routes (protected)
app.use('/api/cli', authenticateToken, cliAuthRoutes);

// User API Routes (protected)
app.use('/api/user', authenticateToken, userRoutes);

// Agent API Routes (uses API key authentication)
app.use('/api/agent', agentRoutes);

// API Routes - Task-driven workflow (protected)
app.use('/api/projects', authenticateToken, projectsRoutes);
app.use('/api', authenticateToken, tasksRoutes);
app.use('/api', authenticateToken, conversationsRoutes);

// Serve public files (like api-docs.html)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes (protected)

// System update endpoint
app.post('/api/system/update', authenticateToken, async (req, res) => {
    try {
        // Get the project root directory (parent of server directory)
        const projectRoot = path.join(__dirname, '..');

        console.log('Starting system update from directory:', projectRoot);

        // Run the update command
        const updateCommand = 'git checkout main && git pull && npm install';

        const child = spawn('sh', ['-c', updateCommand], {
            cwd: projectRoot,
            env: process.env
        });

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            console.log('Update output:', text);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;
            console.error('Update error:', text);
        });

        child.on('close', (code) => {
            if (code === 0) {
                res.json({
                    success: true,
                    output: output || 'Update completed successfully',
                    message: 'Update completed. Please restart the server to apply changes.'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Update command failed',
                    output: output,
                    errorOutput: errorOutput
                });
            }
        });

        child.on('error', (error) => {
            console.error('Update process error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        });

    } catch (error) {
        console.error('System update error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Browse filesystem endpoint for project suggestions - uses existing getFileTree
app.get('/api/browse-filesystem', authenticateToken, async (req, res) => {    
    try {
        const { path: dirPath } = req.query;
        
        // Default to home directory if no path provided
        const homeDir = os.homedir();
        let targetPath = dirPath ? dirPath.replace('~', homeDir) : homeDir;
        
        // Resolve and normalize the path
        targetPath = path.resolve(targetPath);
        
        // Security check - ensure path is accessible
        try {
            await fs.promises.access(targetPath);
            const stats = await fs.promises.stat(targetPath);
            
            if (!stats.isDirectory()) {
                return res.status(400).json({ error: 'Path is not a directory' });
            }
        } catch (err) {
            return res.status(404).json({ error: 'Directory not accessible' });
        }
        
        // Use existing getFileTree function with shallow depth (only direct children)
        const fileTree = await getFileTree(targetPath, 1, 0, false); // maxDepth=1, showHidden=false
        
        // Filter only directories and format for suggestions
        const directories = fileTree
            .filter(item => item.type === 'directory')
            .map(item => ({
                path: item.path,
                name: item.name,
                type: 'directory'
            }))
            .slice(0, 20); // Limit results
            
        // Add common directories if browsing home directory
        const suggestions = [];
        if (targetPath === homeDir) {
            const commonDirs = ['Desktop', 'Documents', 'Projects', 'Development', 'Dev', 'Code', 'workspace'];
            const existingCommon = directories.filter(dir => commonDirs.includes(dir.name));
            const otherDirs = directories.filter(dir => !commonDirs.includes(dir.name));
            
            suggestions.push(...existingCommon, ...otherDirs);
        } else {
            suggestions.push(...directories);
        }
        
        res.json({ 
            path: targetPath,
            suggestions: suggestions 
        });
        
    } catch (error) {
        console.error('Error browsing filesystem:', error);
        res.status(500).json({ error: 'Failed to browse filesystem' });
    }
});

// Get files for a project (for @ file referencing in chat input)
app.get('/api/projects/:id/files', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const projectId = parseInt(req.params.id, 10);

        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }

        const project = projectsDb.getById(projectId, userId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Get file tree for the project directory
        const fileTree = await getFileTree(project.repo_folder_path, 4, 0, false); // maxDepth=4, showHidden=false
        res.json(fileTree);
    } catch (error) {
        console.error('Error getting project files:', error);
        res.status(500).json({ error: 'Failed to get project files' });
    }
});

// WebSocket connection handler that routes based on URL path
wss.on('connection', (ws, request) => {
    const url = request.url;
    console.log('[INFO] Client connected to:', url);

    // Parse URL to get pathname without query parameters
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/shell') {
        handleShellConnection(ws);
    } else if (pathname === '/ws') {
        handleChatConnection(ws);
    } else {
        console.log('[WARN] Unknown WebSocket path:', pathname);
        ws.close();
    }
});

// Handle chat WebSocket connections
function handleChatConnection(ws) {
    console.log('[INFO] Chat WebSocket connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'claude-command') {
                console.log('[DEBUG] User message:', data.command || '[Continue/Resume]');
                console.log('📁 Project:', data.options?.projectPath || 'Unknown');
                console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');

                // Check for task-based conversation flow
                const { taskId, conversationId, isNewConversation } = data.options || {};
                let sdkOptions = { ...data.options };
                let dbConversationId = null;

                if (taskId && isNewConversation) {
                    // NEW CONVERSATION FLOW
                    // 1. Look up task → get project → get repo_folder_path
                    console.log('[DEBUG] Starting new task-based conversation for taskId:', taskId);
                    const taskWithProject = tasksDb.getWithProject(taskId);

                    if (!taskWithProject) {
                        ws.send(JSON.stringify({
                            type: 'claude-error',
                            error: `Task ${taskId} not found`
                        }));
                        return;
                    }

                    // 2. Create conversation record in DB
                    const conversation = conversationsDb.create(taskId);
                    dbConversationId = conversation.id;
                    console.log('[DEBUG] Created conversation record:', dbConversationId);

                    // 3. Build context prompt from project.md and task markdown
                    const contextPrompt = buildContextPrompt(taskWithProject.repo_folder_path, taskId);

                    // 4. Set up SDK options with custom system prompt and cwd
                    sdkOptions.cwd = taskWithProject.repo_folder_path;
                    if (contextPrompt) {
                        sdkOptions.customSystemPrompt = contextPrompt;
                        console.log('[DEBUG] Injected context prompt length:', contextPrompt.length);
                    }

                    // 5. Store dbConversationId for session-created callback
                    sdkOptions._dbConversationId = dbConversationId;

                } else if (conversationId && !isNewConversation) {
                    // RESUME CONVERSATION FLOW
                    console.log('[DEBUG] Resuming conversation:', conversationId);
                    const conversation = conversationsDb.getById(conversationId);

                    if (!conversation) {
                        ws.send(JSON.stringify({
                            type: 'claude-error',
                            error: `Conversation ${conversationId} not found`
                        }));
                        return;
                    }

                    if (!conversation.claude_conversation_id) {
                        ws.send(JSON.stringify({
                            type: 'claude-error',
                            error: `Conversation ${conversationId} has no Claude session ID yet`
                        }));
                        return;
                    }

                    // Get the task and project for cwd
                    const taskWithProject = tasksDb.getWithProject(conversation.task_id);
                    if (taskWithProject) {
                        sdkOptions.cwd = taskWithProject.repo_folder_path;
                    }

                    // Resume using Claude's session ID
                    sdkOptions.sessionId = conversation.claude_conversation_id;
                    dbConversationId = conversationId;
                    console.log('[DEBUG] Resuming Claude session:', conversation.claude_conversation_id);
                }

                // Create a wrapper around ws to capture session ID for new task-based conversations
                const wsWrapper = {
                    send: ws.send.bind(ws),
                    setSessionId: (claudeSessionId) => {
                        // Update the conversation record with Claude's session ID
                        if (sdkOptions._dbConversationId && claudeSessionId) {
                            conversationsDb.updateClaudeId(sdkOptions._dbConversationId, claudeSessionId);
                            console.log('[DEBUG] Updated conversation', sdkOptions._dbConversationId, 'with Claude session:', claudeSessionId);

                            // Also send the dbConversationId to frontend
                            ws.send(JSON.stringify({
                                type: 'conversation-created',
                                conversationId: sdkOptions._dbConversationId,
                                claudeSessionId
                            }));
                        }
                    }
                };

                // Use Claude Agents SDK
                await queryClaudeSDK(data.command, sdkOptions, wsWrapper);
            } else if (data.type === 'abort-session') {
                console.log('[DEBUG] Abort session request:', data.sessionId);
                const success = await abortClaudeSDKSession(data.sessionId);

                ws.send(JSON.stringify({
                    type: 'session-aborted',
                    sessionId: data.sessionId,
                    success
                }));
            } else if (data.type === 'check-session-status') {
                // Check if a specific session is currently processing
                const sessionId = data.sessionId;
                const isActive = isClaudeSDKSessionActive(sessionId);

                ws.send(JSON.stringify({
                    type: 'session-status',
                    sessionId,
                    isProcessing: isActive
                }));
            } else if (data.type === 'get-active-sessions') {
                // Get all currently active sessions
                const activeSessions = {
                    claude: getActiveClaudeSDKSessions()
                };
                ws.send(JSON.stringify({
                    type: 'active-sessions',
                    sessions: activeSessions
                }));
            } else if (data.type === 'subscribe-session') {
                // Subscribe client to a specific session for targeted message delivery
                const { sessionId, provider } = data;
                console.log('[DEBUG] Client subscribing to session:', sessionId, 'provider:', provider || 'claude');

                clientSubscriptions.set(ws, {
                    sessionId: sessionId || null,
                    provider: provider || 'claude'
                });

                ws.send(JSON.stringify({
                    type: 'session-subscribed',
                    sessionId,
                    provider: provider || 'claude',
                    success: true
                }));
            } else if (data.type === 'unsubscribe-session') {
                // Unsubscribe client from current session
                console.log('[DEBUG] Client unsubscribing from session');
                clientSubscriptions.delete(ws);

                ws.send(JSON.stringify({
                    type: 'session-unsubscribed',
                    success: true
                }));
            }
        } catch (error) {
            console.error('[ERROR] Chat WebSocket error:', error.message);
            ws.send(JSON.stringify({
                type: 'error',
                error: error.message
            }));
        }
    });

    ws.on('close', () => {
        console.log('🔌 Chat client disconnected');
        // Clean up subscription
        clientSubscriptions.delete(ws);
    });
}

// Handle shell WebSocket connections
function handleShellConnection(ws) {
    console.log('🐚 Shell client connected');
    let shellProcess = null;
    let ptySessionKey = null;
    let outputBuffer = [];

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 Shell message received:', data.type);

            if (data.type === 'init') {
                const projectPath = data.projectPath || process.cwd();
                const sessionId = data.sessionId;
                const hasSession = data.hasSession;
                const provider = data.provider || 'claude';
                const initialCommand = data.initialCommand;
                const isPlainShell = data.isPlainShell || (!!initialCommand && !hasSession) || provider === 'plain-shell';

                ptySessionKey = `${projectPath}_${sessionId || 'default'}`;

                const existingSession = ptySessionsMap.get(ptySessionKey);
                if (existingSession) {
                    console.log('♻️  Reconnecting to existing PTY session:', ptySessionKey);
                    shellProcess = existingSession.pty;

                    clearTimeout(existingSession.timeoutId);

                    ws.send(JSON.stringify({
                        type: 'output',
                        data: `\x1b[36m[Reconnected to existing session]\x1b[0m\r\n`
                    }));

                    if (existingSession.buffer && existingSession.buffer.length > 0) {
                        console.log(`📜 Sending ${existingSession.buffer.length} buffered messages`);
                        existingSession.buffer.forEach(bufferedData => {
                            ws.send(JSON.stringify({
                                type: 'output',
                                data: bufferedData
                            }));
                        });
                    }

                    existingSession.ws = ws;

                    return;
                }

                console.log('[INFO] Starting shell in:', projectPath);
                console.log('📋 Session info:', hasSession ? `Resume session ${sessionId}` : (isPlainShell ? 'Plain shell mode' : 'New session'));
                console.log('🤖 Provider:', isPlainShell ? 'plain-shell' : provider);
                if (initialCommand) {
                    console.log('⚡ Initial command:', initialCommand);
                }

                // First send a welcome message
                let welcomeMsg;
                if (isPlainShell) {
                    welcomeMsg = `\x1b[36mStarting terminal in: ${projectPath}\x1b[0m\r\n`;
                } else {
                    welcomeMsg = hasSession ?
                        `\x1b[36mResuming Claude session ${sessionId} in: ${projectPath}\x1b[0m\r\n` :
                        `\x1b[36mStarting new Claude session in: ${projectPath}\x1b[0m\r\n`;
                }

                ws.send(JSON.stringify({
                    type: 'output',
                    data: welcomeMsg
                }));

                try {
                    // Prepare the shell command adapted to the platform
                    let shellCommand;
                    if (isPlainShell) {
                        // Plain shell mode - just run the initial command in the project directory
                        if (os.platform() === 'win32') {
                            shellCommand = `Set-Location -Path "${projectPath}"; ${initialCommand}`;
                        } else {
                            shellCommand = `cd "${projectPath}" && ${initialCommand}`;
                        }
                    } else {
                        // Use claude command (default) or initialCommand if provided
                        const command = initialCommand || 'claude';
                        if (os.platform() === 'win32') {
                            if (hasSession && sessionId) {
                                // Try to resume session, but with fallback to new session if it fails
                                shellCommand = `Set-Location -Path "${projectPath}"; claude --resume ${sessionId}; if ($LASTEXITCODE -ne 0) { claude }`;
                            } else {
                                shellCommand = `Set-Location -Path "${projectPath}"; ${command}`;
                            }
                        } else {
                            if (hasSession && sessionId) {
                                shellCommand = `cd "${projectPath}" && claude --resume ${sessionId} || claude`;
                            } else {
                                shellCommand = `cd "${projectPath}" && ${command}`;
                            }
                        }
                    }

                    console.log('🔧 Executing shell command:', shellCommand);

                    // Use appropriate shell based on platform
                    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
                    const shellArgs = os.platform() === 'win32' ? ['-Command', shellCommand] : ['-c', shellCommand];

                    // Use terminal dimensions from client if provided, otherwise use defaults
                    const termCols = data.cols || 80;
                    const termRows = data.rows || 24;
                    console.log('📐 Using terminal dimensions:', termCols, 'x', termRows);

                    shellProcess = pty.spawn(shell, shellArgs, {
                        name: 'xterm-256color',
                        cols: termCols,
                        rows: termRows,
                        cwd: process.env.HOME || (os.platform() === 'win32' ? process.env.USERPROFILE : '/'),
                        env: {
                            ...process.env,
                            TERM: 'xterm-256color',
                            COLORTERM: 'truecolor',
                            FORCE_COLOR: '3',
                            // Override browser opening commands to echo URL for detection
                            BROWSER: os.platform() === 'win32' ? 'echo "OPEN_URL:"' : 'echo "OPEN_URL:"'
                        }
                    });

                    console.log('🟢 Shell process started with PTY, PID:', shellProcess.pid);

                    ptySessionsMap.set(ptySessionKey, {
                        pty: shellProcess,
                        ws: ws,
                        buffer: [],
                        timeoutId: null,
                        projectPath,
                        sessionId
                    });

                    // Handle data output
                    shellProcess.onData((data) => {
                        const session = ptySessionsMap.get(ptySessionKey);
                        if (!session) return;

                        if (session.buffer.length < 5000) {
                            session.buffer.push(data);
                        } else {
                            session.buffer.shift();
                            session.buffer.push(data);
                        }

                        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
                            let outputData = data;

                            // Check for various URL opening patterns
                            const patterns = [
                                // Direct browser opening commands
                                /(?:xdg-open|open|start)\s+(https?:\/\/[^\s\x1b\x07]+)/g,
                                // BROWSER environment variable override
                                /OPEN_URL:\s*(https?:\/\/[^\s\x1b\x07]+)/g,
                                // Git and other tools opening URLs
                                /Opening\s+(https?:\/\/[^\s\x1b\x07]+)/gi,
                                // General URL patterns that might be opened
                                /Visit:\s*(https?:\/\/[^\s\x1b\x07]+)/gi,
                                /View at:\s*(https?:\/\/[^\s\x1b\x07]+)/gi,
                                /Browse to:\s*(https?:\/\/[^\s\x1b\x07]+)/gi
                            ];

                            patterns.forEach(pattern => {
                                let match;
                                while ((match = pattern.exec(data)) !== null) {
                                    const url = match[1];
                                    console.log('[DEBUG] Detected URL for opening:', url);

                                    // Send URL opening message to client
                                    session.ws.send(JSON.stringify({
                                        type: 'url_open',
                                        url: url
                                    }));

                                    // Replace the OPEN_URL pattern with a user-friendly message
                                    if (pattern.source.includes('OPEN_URL')) {
                                        outputData = outputData.replace(match[0], `[INFO] Opening in browser: ${url}`);
                                    }
                                }
                            });

                            // Send regular output
                            session.ws.send(JSON.stringify({
                                type: 'output',
                                data: outputData
                            }));
                        }
                    });

                    // Handle process exit
                    shellProcess.onExit((exitCode) => {
                        console.log('🔚 Shell process exited with code:', exitCode.exitCode, 'signal:', exitCode.signal);
                        const session = ptySessionsMap.get(ptySessionKey);
                        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
                            session.ws.send(JSON.stringify({
                                type: 'output',
                                data: `\r\n\x1b[33mProcess exited with code ${exitCode.exitCode}${exitCode.signal ? ` (${exitCode.signal})` : ''}\x1b[0m\r\n`
                            }));
                        }
                        if (session && session.timeoutId) {
                            clearTimeout(session.timeoutId);
                        }
                        ptySessionsMap.delete(ptySessionKey);
                        shellProcess = null;
                    });

                } catch (spawnError) {
                    console.error('[ERROR] Error spawning process:', spawnError);
                    ws.send(JSON.stringify({
                        type: 'output',
                        data: `\r\n\x1b[31mError: ${spawnError.message}\x1b[0m\r\n`
                    }));
                }

            } else if (data.type === 'input') {
                // Send input to shell process
                if (shellProcess && shellProcess.write) {
                    try {
                        shellProcess.write(data.data);
                    } catch (error) {
                        console.error('Error writing to shell:', error);
                    }
                } else {
                    console.warn('No active shell process to send input to');
                }
            } else if (data.type === 'resize') {
                // Handle terminal resize
                if (shellProcess && shellProcess.resize) {
                    console.log('Terminal resize requested:', data.cols, 'x', data.rows);
                    shellProcess.resize(data.cols, data.rows);
                }
            }
        } catch (error) {
            console.error('[ERROR] Shell WebSocket error:', error.message);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'output',
                    data: `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`
                }));
            }
        }
    });

    ws.on('close', () => {
        console.log('🔌 Shell client disconnected');

        if (ptySessionKey) {
            const session = ptySessionsMap.get(ptySessionKey);
            if (session) {
                console.log('⏳ PTY session kept alive, will timeout in 30 minutes:', ptySessionKey);
                session.ws = null;

                session.timeoutId = setTimeout(() => {
                    console.log('⏰ PTY session timeout, killing process:', ptySessionKey);
                    if (session.pty && session.pty.kill) {
                        session.pty.kill();
                    }
                    ptySessionsMap.delete(ptySessionKey);
                }, PTY_SESSION_TIMEOUT);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('[ERROR] Shell WebSocket error:', error);
    });
}
// Audio transcription endpoint
app.post('/api/transcribe', authenticateToken, async (req, res) => {
    try {
        const multer = (await import('multer')).default;
        const upload = multer({ storage: multer.memoryStorage() });

        // Handle multipart form data
        upload.single('audio')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: 'Failed to process audio file' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No audio file provided' });
            }

            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.' });
            }

            try {
                // Convert audio to mp3 format for GPT-4o-mini (only supports wav and mp3)
                const ffmpeg = (await import('fluent-ffmpeg')).default;
                const ffmpegPath = (await import('ffmpeg-static')).default;
                const { Readable } = await import('stream');
                const { promisify } = await import('util');
                const tmpDir = await import('os').then(os => os.tmpdir());
                const pathModule = await import('path');

                ffmpeg.setFfmpegPath(ffmpegPath);

                // Create temp files for conversion
                const inputPath = pathModule.default.join(tmpDir, `input_${Date.now()}.webm`);
                const outputPath = pathModule.default.join(tmpDir, `output_${Date.now()}.mp3`);

                // Write input buffer to temp file
                await fsPromises.writeFile(inputPath, req.file.buffer);

                // Convert to mp3
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .toFormat('mp3')
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outputPath);
                });

                // Read converted file
                const convertedBuffer = await fsPromises.readFile(outputPath);
                const audioBase64 = convertedBuffer.toString('base64');

                // Clean up temp files
                await fsPromises.unlink(inputPath).catch(() => {});
                await fsPromises.unlink(outputPath).catch(() => {});

                // Use GPT-4o-mini for transcription
                const OpenAI = (await import('openai')).default;
                const openai = new OpenAI({ apiKey });

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini-audio-preview',
                    modalities: ['text'],
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Please transcribe the audio accurately. Only provide the transcription text, nothing else.'
                                },
                                {
                                    type: 'input_audio',
                                    input_audio: {
                                        data: audioBase64,
                                        format: 'mp3'
                                    }
                                }
                            ]
                        }
                    ],
                    temperature: 0.0
                });

                let transcribedText = completion.choices[0].message.content || '';

                // Check if enhancement mode is enabled
                const mode = req.body.mode || 'default';

                // If no transcribed text, return empty
                if (!transcribedText) {
                    return res.json({ text: '' });
                }

                // If default mode, return transcribed text without enhancement
                if (mode === 'default') {
                    return res.json({ text: transcribedText });
                }

                // Handle different enhancement modes
                try {
                    let prompt, systemMessage, temperature = 0.7, maxTokens = 800;

                    switch (mode) {
                        case 'prompt':
                            systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
                            prompt = `You are an expert prompt engineer. Transform the following rough instruction into a clear, detailed, and context-aware AI prompt.

Your enhanced prompt should:
1. Be specific and unambiguous
2. Include relevant context and constraints
3. Specify the desired output format
4. Use clear, actionable language
5. Include examples where helpful
6. Consider edge cases and potential ambiguities

Transform this rough instruction into a well-crafted prompt:
"${transcribedText}"

Enhanced prompt:`;
                            break;

                        case 'vibe':
                        case 'instructions':
                        case 'architect':
                            systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
                            temperature = 0.5; // Lower temperature for more controlled output
                            prompt = `Transform the following idea into clear, well-structured instructions that an AI agent can easily understand and execute.

IMPORTANT RULES:
- Format as clear, step-by-step instructions
- Add reasonable implementation details based on common patterns
- Only include details directly related to what was asked
- Do NOT add features or functionality not mentioned
- Keep the original intent and scope intact
- Use clear, actionable language an agent can follow

Transform this idea into agent-friendly instructions:
"${transcribedText}"

Agent instructions:`;
                            break;

                        default:
                            // No enhancement needed
                            break;
                    }

                    // Only make GPT call if we have a prompt
                    if (prompt) {
                        const completion = await openai.chat.completions.create({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: systemMessage },
                                { role: 'user', content: prompt }
                            ],
                            temperature: temperature,
                            max_tokens: maxTokens
                        });

                        transcribedText = completion.choices[0].message.content || transcribedText;
                    }

                } catch (gptError) {
                    console.error('GPT processing error:', gptError);
                    // Fall back to original transcription if GPT fails
                }

                res.json({ text: transcribedText });

            } catch (error) {
                console.error('Transcription error:', error);
                res.status(500).json({ error: error.message });
            }
        });
    } catch (error) {
        console.error('Endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Backend only serves API routes - frontend is handled by Vite on port 5173

// Helper function to convert permissions to rwx format
function permToRwx(perm) {
    const r = perm & 4 ? 'r' : '-';
    const w = perm & 2 ? 'w' : '-';
    const x = perm & 1 ? 'x' : '-';
    return r + w + x;
}

async function getFileTree(dirPath, maxDepth = 3, currentDepth = 0, showHidden = true) {
    // Using fsPromises from import
    const items = [];

    try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            // Debug: log all entries including hidden files


            // Skip only heavy build directories
            if (entry.name === 'node_modules' ||
                entry.name === 'dist' ||
                entry.name === 'build') continue;

            const itemPath = path.join(dirPath, entry.name);
            const item = {
                name: entry.name,
                path: itemPath,
                type: entry.isDirectory() ? 'directory' : 'file'
            };

            // Get file stats for additional metadata
            try {
                const stats = await fsPromises.stat(itemPath);
                item.size = stats.size;
                item.modified = stats.mtime.toISOString();

                // Convert permissions to rwx format
                const mode = stats.mode;
                const ownerPerm = (mode >> 6) & 7;
                const groupPerm = (mode >> 3) & 7;
                const otherPerm = mode & 7;
                item.permissions = ((mode >> 6) & 7).toString() + ((mode >> 3) & 7).toString() + (mode & 7).toString();
                item.permissionsRwx = permToRwx(ownerPerm) + permToRwx(groupPerm) + permToRwx(otherPerm);
            } catch (statError) {
                // If stat fails, provide default values
                item.size = 0;
                item.modified = null;
                item.permissions = '000';
                item.permissionsRwx = '---------';
            }

            if (entry.isDirectory() && currentDepth < maxDepth) {
                // Recursively get subdirectories but limit depth
                try {
                    // Check if we can access the directory before trying to read it
                    await fsPromises.access(item.path, fs.constants.R_OK);
                    item.children = await getFileTree(item.path, maxDepth, currentDepth + 1, showHidden);
                } catch (e) {
                    // Silently skip directories we can't access (permission denied, etc.)
                    item.children = [];
                }
            }

            items.push(item);
        }
    } catch (error) {
        // Only log non-permission errors to avoid spam
        if (error.code !== 'EACCES' && error.code !== 'EPERM') {
            console.error('Error reading directory:', error);
        }
    }

    return items.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
}

const PORT = process.env.PORT || 3001;

// Initialize database and start server
async function startServer() {
    try {
        // Initialize authentication database
        await initializeDatabase();

        // Log startup info
        console.log(`${c.info('[INFO]')} Using Claude Agents SDK for Claude integration`);
        console.log(`${c.info('[INFO]')} Frontend served by Vite at ${c.dim('http://localhost:' + (process.env.VITE_PORT || 5173))}`)

        server.listen(PORT, '0.0.0.0', async () => {
            const appInstallPath = path.join(__dirname, '..');

            console.log('');
            console.log(c.dim('═'.repeat(63)));
            console.log(`  ${c.bright('Claude Code UI Server - Ready')}`);
            console.log(c.dim('═'.repeat(63)));
            console.log('');
            console.log(`${c.info('[INFO]')} Server URL:  ${c.bright('http://0.0.0.0:' + PORT)}`);
            console.log(`${c.info('[INFO]')} Installed at: ${c.dim(appInstallPath)}`);
            console.log(`${c.tip('[TIP]')}  Run "cloudcli status" for full configuration details`);
            console.log('');
        });
    } catch (error) {
        console.error('[ERROR] Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
