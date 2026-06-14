const { feishuApi, getRecords, QA_TABLE_ID, BASE_TOKEN } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { orderedIds } = req.body;
    const records = await getRecords(QA_TABLE_ID);
    const map = new Map(records.map(r => [Number(r.fields.item_id), r]));
    for (let i = 0; i < orderedIds.length; i++) {
      const rec = map.get(orderedIds[i]);
      if (rec) {
        await feishuApi('PUT', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/${rec.record_id}`, {
          fields: { item_id: String(i + 1) }
        });
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
