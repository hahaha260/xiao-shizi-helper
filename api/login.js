const { getRecords, CONFIG_TABLE_ID } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const configRecords = await getRecords(CONFIG_TABLE_ID);
    const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
    const adminPass = passRecord ? passRecord.fields.value : 'admin123';
    res.status(200).json({ ok: req.body.password === adminPass });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
