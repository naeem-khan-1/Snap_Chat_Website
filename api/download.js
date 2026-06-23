const fetch = require('node-fetch');
const { BROWSER_UA } = require('../lib/snapchat');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).send(buffer);
  } catch (err) {
    console.error('[Download] Error:', err.message);
    return res.status(500).json({ error: 'Download failed. The media may have expired.' });
  }
};
