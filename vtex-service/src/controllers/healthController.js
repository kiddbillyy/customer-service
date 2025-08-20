exports.health = (req, res) => res.json({ status: 'ok', ts: Date.now() });
