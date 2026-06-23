const { scrapeSnapchatProfile } = require('../../lib/snapchat');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', stories: [] });
  }

  let username = (req.query.username || '').replace(/^@/, '').trim();

  if (!username || username.length < 2) {
    return res.status(400).json({
      error: 'Please enter a valid Snapchat username (at least 2 characters).',
      stories: [],
    });
  }

  try {
    const result = await scrapeSnapchatProfile(username);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[API] Error for @${username}:`, err.message);
    return res.status(500).json({
      error: 'Could not load stories right now. Please try again in a moment.',
      stories: [],
    });
  }
};
