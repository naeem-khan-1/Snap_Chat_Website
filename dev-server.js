/**
 * Local development server (npm run dev).
 * Vercel production uses api/ serverless routes instead.
 */
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const { scrapeSnapchatProfile, BROWSER_UA } = require('./lib/snapchat');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stories/:username', async (req, res) => {
  let username = (req.params.username || '').replace(/^@/, '').trim();

  if (!username || username.length < 2) {
    return res.status(400).json({
      error: 'Please enter a valid Snapchat username (at least 2 characters).',
      stories: [],
    });
  }

  try {
    const result = await scrapeSnapchatProfile(username);
    return res.json(result);
  } catch (err) {
    console.error(`[API] Error for @${username}:`, err.message);
    return res.status(500).json({
      error: 'Could not load stories right now. Please try again in a moment.',
      stories: [],
    });
  }
});

app.get('/api/download', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing download URL.' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://www.snapchat.com/',
      },
    });

    if (!upstream.ok) {
      throw new Error(`Snapchat CDN returned ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isVideo = contentType.includes('video');
    const ext = isVideo ? 'mp4' : 'jpg';
    const buffer = await upstream.buffer();

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="snapsaver_${Date.now()}.${ext}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Download] Error:', err.message);
    return res.status(500).json({ error: 'Download failed. The media may have expired.' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`SnapSaver dev server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop it with: lsof -ti :${PORT} | xargs kill -9`);
    process.exit(1);
  }
  throw err;
});
