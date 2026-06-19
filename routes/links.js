const router = require('express').Router();
const ogs = require('open-graph-scraper');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Blokiraj loopback / privatne / link-local adrese kako bi spriječili SSRF
function isPublicHost(hostname) {
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^169\.254\./,
    /^0\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
  ];
  return !blocked.some(rx => rx.test(hostname));
}

router.get('/preview', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: 'url is required' });

  // Validiraj URL prije nego što ga proslijedimo OGS-u
  let parsed;
  try { parsed = new URL(url); }
  catch { return res.status(400).json({ ok: false, error: 'Invalid URL' }); }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol) || !isPublicHost(parsed.hostname)) {
    return res.status(400).json({ ok: false, error: 'URL not allowed' });
  }

  try {
    const { result } = await ogs({ url, timeout: 5000 });
    if (!result.success) return res.json({ ok: true, preview: null });

    return res.json({
      ok: true,
      preview: {
        title:       result.ogTitle       || result.twitterTitle || '',
        description: result.ogDescription || result.twitterDescription || '',
        image:       result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || '',
        url,
      },
    });
  } catch (err) {
    console.warn(`[links] preview failed for ${url}: ${err.message}`);
    return res.json({ ok: true, preview: null });
  }
});

module.exports = router;