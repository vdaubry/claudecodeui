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
import fetch from 'node-fetch';
import mime from 'mime-types';

import {
  sendMessage,
  abortSession,
  isSessionActive,
  getActiveSessions,
  getAllActiveStreamingSessions
} from './services/conversationAdapter.js';
import authRoutes from './routes/auth.js';
import commandsRoutes from './routes/commands.js';
import userRoutes from './routes/user.js';
import projectsRoutes from './routes/projects.js';
import tasksRoutes from './routes/tasks.js';
import conversationsRoutes from './routes/conversations.js';
import agentRunsRoutes from './routes/agent-runs.js';
import agentsRoutes from './routes/agents.js';
import { initializeDatabase, projectsDb, tasksDb, conversationsDb, agentRunsDb, agentsDb } from './database/db.js';
import { readAgentPrompt } from './services/documentation.js';
import { transcribeAudio } from './services/transcription.js';
import { validateApiKey, authenticateToken, authenticateWebSocket } from './middleware/auth.js';

// Track which session each client is subscribed to for targeted message delivery
const clientSubscriptions = new Map(); // Map<WebSocket, { sessionId: string | null, provider: string }>

// Track which tasks each client is subscribed to for live updates on Task Detail page
const taskSubscriptions = new Map(); // Map<WebSocket, Set<taskId>>

// Broadcast message to all connected WebSocket clients
function broadcastToAll(wss, message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Broadcast message only to clients subscribed to a specific task
function broadcastToTaskSubscribers(taskId, message) {
    const messageWithTaskId = { ...message, taskId };
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            const subscribedTasks = taskSubscriptions.get(client);
            if (subscribedTasks?.has(taskId)) {
                client.send(JSON.stringify(messageWithTaskId));
            }
        }
    });
}


const app = express();
const server = http.createServer(app);

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

// WebSocket heartbeat to detect stale connections
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('[WS] Terminating stale connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

// Cleanup heartbeat interval when server closes
wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

// Make WebSocket server and broadcast functions available to routes
app.locals.wss = wss;
app.locals.broadcastToTaskSubscribers = broadcastToTaskSubscribers;

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

// Commands API Routes (protected)
app.use('/api/commands', authenticateToken, commandsRoutes);

// User API Routes (protected)
app.use('/api/user', authenticateToken, userRoutes);

// API Routes - Task-driven workflow (protected)
app.use('/api/projects', authenticateToken, projectsRoutes);
app.use('/api', authenticateToken, tasksRoutes);
app.use('/api', authenticateToken, conversationsRoutes);
app.use('/api', authenticateToken, agentRunsRoutes);
app.use('/api', authenticateToken, agentsRoutes);

// Get active streaming sessions (for Dashboard live indicator)
app.get('/api/streaming-sessions', authenticateToken, (req, res) => {
    const sessions = getAllActiveStreamingSessions();
    res.json({ sessions });
});

// Serve public files (like api-docs.html)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes (protected)

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

// WebSocket connection handler
wss.on('connection', (ws, request) => {
    const url = request.url;
    console.log('[INFO] Client connected to:', url);

    // Parse URL to get pathname without query parameters
    const urlObj = new URL(url, 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/ws') {
        handleChatConnection(ws, request);
    } else {
        console.log('[WARN] Unknown WebSocket path:', pathname);
        ws.close();
    }
});

// Handle chat WebSocket connections
function handleChatConnection(ws, request) {
    console.log('[INFO] Chat WebSocket connected');

    // Initialize heartbeat tracking for this connection
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'claude-command') {
                console.log('[DEBUG] User message:', data.command || '[Continue/Resume]');

                // Extract conversation options (new conversations must be created via REST API)
                const { conversationId, images, permissionMode } = data.options || {};
                const userId = request?.user?.id;

                // Create broadcast function that sends to all WebSocket clients
                // Note: broadcastToAll already includes ws (the originating client) in wss.clients
                const broadcastFn = (convId, msg) => {
                    broadcastToAll(wss, msg);
                };

                try {
                    if (conversationId) {
                        // RESUME CONVERSATION FLOW (works for both task and agent conversations)
                        // New conversations must be created via REST API (modal-first flow)
                        console.log('[DEBUG] Resuming conversation:', conversationId);

                        await sendMessage(conversationId, data.command, {
                            broadcastFn,
                            broadcastToTaskSubscribersFn: broadcastToTaskSubscribers,
                            userId,
                            images,
                            permissionMode: permissionMode || 'bypassPermissions'
                        });
                    } else {
                        // Error - new conversations must use REST API
                        ws.send(JSON.stringify({
                            type: 'claude-error',
                            error: 'New conversations must be created via REST API. Use the modal to start a conversation.'
                        }));
                    }
                } catch (error) {
                    console.error('[WebSocket] Conversation error:', error);
                    ws.send(JSON.stringify({
                        type: 'claude-error',
                        error: error.message
                    }));
                }

            } else if (data.type === 'abort-session') {
                console.log('[DEBUG] Abort session request:', data.sessionId);
                const success = await abortSession(data.sessionId);

                ws.send(JSON.stringify({
                    type: 'session-aborted',
                    sessionId: data.sessionId,
                    success
                }));
            } else if (data.type === 'check-session-status') {
                // Check if a specific session is currently processing
                const sessionId = data.sessionId;
                const isActive = isSessionActive(sessionId);

                ws.send(JSON.stringify({
                    type: 'session-status',
                    sessionId,
                    isProcessing: isActive
                }));
            } else if (data.type === 'get-active-sessions') {
                // Get all currently active sessions
                const activeSessions = {
                    claude: getActiveSessions()
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
            } else if (data.type === 'subscribe-task') {
                // Subscribe client to task updates for live Task Detail page
                const { taskId } = data;
                console.log('[DEBUG] Client subscribing to task:', taskId);

                if (!taskSubscriptions.has(ws)) {
                    taskSubscriptions.set(ws, new Set());
                }
                taskSubscriptions.get(ws).add(taskId);

                ws.send(JSON.stringify({
                    type: 'task-subscribed',
                    taskId,
                    success: true
                }));
            } else if (data.type === 'unsubscribe-task') {
                // Unsubscribe client from task updates
                const { taskId } = data;
                console.log('[DEBUG] Client unsubscribing from task:', taskId);

                taskSubscriptions.get(ws)?.delete(taskId);

                ws.send(JSON.stringify({
                    type: 'task-unsubscribed',
                    taskId,
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
        // Clean up subscriptions
        clientSubscriptions.delete(ws);
        taskSubscriptions.delete(ws);
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

            try {
                const text = await transcribeAudio(req.file.buffer);
                res.json({ text });
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
