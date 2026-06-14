const { getRecords, recordToQA, QA_TABLE_ID, CAT_TABLE_ID, CONFIG_TABLE_ID } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const [qaRecords, catRecords, configRecords] = await Promise.all([
      getRecords(QA_TABLE_ID), getRecords(CAT_TABLE_ID), getRecords(CONFIG_TABLE_ID)
    ]);
    const qaItems = qaRecords.map(recordToQA).sort((a, b) => a.id - b.id);
    const categories = catRecords.map(r => r.fields.name || '');
    const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
    const adminPass = passRecord ? passRecord.fields.value : 'admin123';
    res.status(200).json({ qaItems, categories, adminPass });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
