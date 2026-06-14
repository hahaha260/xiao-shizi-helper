const { feishuApi, getRecords, CAT_TABLE_ID, BASE_TOKEN } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const records = await getRecords(CAT_TABLE_ID);
    const rec = records.find(r => r.fields.name === name);
    if (rec) {
      await feishuApi('DELETE', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CAT_TABLE_ID}/records/${rec.record_id}`);
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
