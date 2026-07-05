/**
 * Vercel serverless function — Chat via OpenRouter (streaming SSE)
 *
 * Env vars (set in Vercel dashboard):
 *   OPENROUTER_API_KEY  — your OpenRouter API key
 *   OPENROUTER_MODEL    — optional (default: deepseek/deepseek-chat-v3-0324:free)
 *   OPENROUTER_BASE_URL — optional (default: https://openrouter.ai/api/v1)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, '..', '.claude', 'skills', 'jiahao-chen.md');

let SYSTEM_PROMPT;
try {
  SYSTEM_PROMPT = readFileSync(SKILL_PATH, 'utf-8');
} catch {
  SYSTEM_PROMPT = 'You are Jiahao Chen, an AI Infra Engineer. Answer in first person.';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://can-gaa-hou.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://can-gaa-hou.github.io',
      'X-Title': 'Jiahao Chen',
    },
  });

  try {
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
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('API error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Something went wrong. Please try again.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
