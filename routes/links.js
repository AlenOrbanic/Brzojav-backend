const router = require('express').Router();
const ogs    = require('open-graph-scraper');

router.get('/preview', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: 'url is required' });

  try {
    const { result } = await ogs({ url });
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
    return res.json({ ok: true, preview: null });
  }
});

module.exports = router;