
 // Poziva se tijekom gossip procesa. Prima batch korisničkih zapisa od drugih nodeova i mergea ih u lokalni registry.
 // Također šalje natrag svoj snapshot korisničkih zapisa kako bi se oba nodea uskladila u jednom krugu.

const router   = require('express').Router();
const registry = require('../registry');
const peers    = require('../peers');

router.post('/', (req, res) => {
  const { fromNode, records } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ ok: false, error: 'records must be an array' });
  }

  const updated = registry.merge(records);
  if (updated > 0) {
    console.log(`[sync] Merged ${updated} record(s) from ${fromNode || 'unknown'}`);
  }

  // Šaljemo natrag naš snapshot tako da se oba nodea usklade u jednom krugu
  return res.json({
    ok:      true,
    merged:  updated,
    records: registry.all(),
  });
});

module.exports = router;
