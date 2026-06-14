const { feishuApi, getRecords, CAT_TABLE_ID, QA_TABLE_ID, BASE_TOKEN } = require('./_lib');

module.exports = async function handler(req, res) {
  // GET /api/categories - 列出分类
  if (req.method === 'GET') {
    try {
      const records = await getRecords(CAT_TABLE_ID);
      res.status(200).json(records.map(r => r.fields.name || ''));
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // POST /api/categories - 新增分类
  if (req.method === 'POST') {
    try {
      const { name } = req.body;
      const records = await getRecords(CAT_TABLE_ID);
      const existing = records.map(r => r.fields.name);
      if (!existing.includes(name)) {
        await feishuApi('POST', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CAT_TABLE_ID}/records/batch_create`, {
          records: [{ fields: { name } }]
        });
      }
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
