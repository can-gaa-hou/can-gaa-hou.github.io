/**
 * Local dev server — serves static files + /api/chat endpoint (OpenRouter)
 * Usage: node server.js
 * Then open http://localhost:3000
 */

import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { resolve, extname } from 'path';
import OpenAI from 'openai';

const PORT = 3000;
const ROOT = process.cwd();

// Load .env manually for local dev
try {
  const envFile = readFileSync(resolve(ROOT, '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.md':   'text/markdown',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
};

// Load skill
const SKILL_PATH = resolve(ROOT, '.claude', 'skills', 'jiahao-chen.md');
let SYSTEM_PROMPT;
try {
  SYSTEM_PROMPT = readFileSync(SKILL_PATH, 'utf-8');
} catch {
  SYSTEM_PROMPT = 'You are Jiahao Chen, an AI Infra Engineer. Answer in first person.';
}

// --- API handler ---
async function handleChat(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { prompt } = JSON.parse(body);
      if (!prompt?.trim()) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'prompt is required' }));
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Jiahao Chen (local)',
        },
      });

      const stream = await client.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      console.error('API error:', err.message);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });
}

// --- Static file handler ---
function serveStatic(req, res) {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';

  const filePath = resolve(ROOT, '.' + path);
  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end('Internal error');
  }
}

// --- Server ---
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    return handleChat(req, res);
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`→ Local server: http://localhost:${PORT}`);
  console.log(`  API key:  ${process.env.OPENROUTER_API_KEY ? '✓ loaded' : '✗ missing'}`);
  console.log(`  Provider: ${process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}`);
  console.log(`  Model:    ${process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free'}`);
});
