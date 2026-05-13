//Prvo provjeravamo naš node (brzi put).
//Ako zapis nije pronađen, proslijedimo zahtjev zdravim peerovima koji još nisu posjećeni
//(praćeno putem ?visited= parametra upita kako bi se spriječile petlje).
//Vrati prvi pozitivan odgovor ili 404 ako nijedan čvor ne poznaje korisnika.

const router   = require('express').Router();
const fetch    = require('node-fetch');
const registry = require('../registry');
const peers    = require('../peers');

const NODE_ID        = process.env.NODE_ID  || `node-${process.env.PORT || 3000}`;
const SELF_URL       = process.env.SELF_URL || `http://localhost:${process.env.PORT || 3000}`;
const REQUEST_TIMEOUT = 5_000;

router.get('/:username', async (req, res) => {
  const username = req.params.username.toLowerCase().trim();

  // Zaustavimo ponovno posjećivanje istih nodeova
  const visitedParam = req.query.visited || '';
  const visited = new Set(visitedParam ? visitedParam.split(',') : []);
  visited.add(NODE_ID); // Označimo naš node kao visited

  // Provjeri prvo lokalno — ako imamo usera, nema potrebe da gubimo vrijeme na druge nodeove
  const local = registry.lookup(username);
  if (local) {
    console.log(`[lookup] Found ${username} locally on ${NODE_ID}`);
    return res.json({
      ok:       true,
      record:   local,
      foundOn:  NODE_ID,
    });
  }

  // Filtriraj koje nodeove pitati za usera
  const targets = peers
    .healthy()
    .filter(p => p.url !== SELF_URL && !visited.has(p.id));

  if (targets.length === 0) {
    console.log(`[lookup] ${username} not found anywhere (no more peers to ask)`);
    return res.status(404).json({
      ok:    false,
      error: `User "${username}" is not online or does not exist`,
    });
  }

  console.log(`[lookup] ${username} not local — asking ${targets.length} peer(s)…`);

  const visitedStr = Array.from(visited).join(',');

  // Istovremeno pitaj ostale peerove, vrati prvi pozitivan odgovor (ako postoji)
  const result = await Promise.any(
    targets.map(peer => forwardLookup(peer, username, visitedStr))
  ).catch(() => null);

  if (result) {
    return res.json(result);
  }

  return res.status(404).json({
    ok:    false,
    error: `User "${username}" is not online or does not exist`, // Pitali smo sve nodeove ali nije pronađen user
  });
});

//Nismo pronašli usera u našem nodeu, idemo pogledati u druge
async function forwardLookup(peer, username, visitedStr) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const url = `${peer.url}/api/lookup/${encodeURIComponent(username)}?visited=${encodeURIComponent(visitedStr)}`;
    const res = await fetch(url, { signal: controller.signal });

    peers.setHealth(peer.id, res.ok || res.status === 404);

    if (!res.ok) throw new Error(`${peer.id} returned ${res.status}`);

    const data = await res.json();
    if (!data.ok) throw new Error('not found on peer');

    console.log(`[lookup] Got answer from ${peer.id} for user ${username}`);
    return data;
  } catch (err) {
    if (err.name !== 'AbortError') {
      peers.setHealth(peer.id, false);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = router;
