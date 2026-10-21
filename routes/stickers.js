// Korisnikova biblioteka stickera. Svi endpointi traže auth (req.user.username).

const router  = require('express').Router();
const Sticker = require('../models/Sticker');
const { upload, uploadToCloudinary } = require('../middleware/upload');

const MAX_STICKERS_PER_USER = 60;
const MAX_STICKER_BYTES     = 1024 * 1024; // klijent ih smanji na ~256px, pa su obično < 50 KB

function toPublic(s) {
  return { id: s._id.toString(), url: s.url };
}

// GET /api/stickers — moji stickeri (najnoviji prvi)
router.get('/', async (req, res) => {
  try {
    const stickers = await Sticker.find({ owner: req.user.username }).sort({ createdAt: -1 });
    return res.json({ ok: true, stickers: stickers.map(toPublic) });
  } catch (err) {
    console.error('[stickers] GET error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/stickers — upload jednog ili više stickera (multipart, polje "files")
router.post('/', upload.array('files', 10), async (req, res) => {
  const me = req.user.username;

  try {
    const files = (req.files || []).filter(
      f => f.mimetype.startsWith('image/') && f.size <= MAX_STICKER_BYTES
    );
    if (!files.length) {
      return res.status(400).json({ ok: false, error: 'Please upload an image (max 1 MB)' });
    }

    const count = await Sticker.countDocuments({ owner: me });
    if (count + files.length > MAX_STICKERS_PER_USER) {
      return res.status(400).json({
        ok: false,
        error: `You can keep up to ${MAX_STICKERS_PER_USER} stickers. Remove some to add more.`,
      });
    }

    const created = [];
    for (const file of files) {
      const result = await uploadToCloudinary(file.buffer, {
        folder:        'brzojav/stickers',
        resource_type: 'image',
        access_mode:   'public',
        type:          'upload',
      });
      created.push(
        await Sticker.create({ owner: me, url: result.secure_url, publicId: result.public_id })
      );
    }

    // Najnoviji prvi, isto kao GET
    created.reverse();
    return res.status(201).json({ ok: true, stickers: created.map(toPublic) });
  } catch (err) {
    console.error('[stickers] POST error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// DELETE /api/stickers/:id — makni iz moje biblioteke.
// Cloudinary slika se NAMJERNO ne briše: već poslane poruke i dalje pokazuju na taj URL.
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Sticker.findOneAndDelete({
      _id:   req.params.id,
      owner: req.user.username,
    }).catch(() => null); // neispravan ObjectId

    if (!deleted) return res.status(404).json({ ok: false, error: 'Sticker not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[stickers] DELETE error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
