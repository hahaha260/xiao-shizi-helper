const { feishuApi, getRecords, recordToQA, QA_TABLE_ID, BASE_TOKEN } = require('./_lib');

module.exports = async function handler(req, res) {
  // GET /api/qa - 列出所有QA
  if (req.method === 'GET') {
    try {
      const records = await getRecords(QA_TABLE_ID);
      res.status(200).json(records.map(recordToQA).sort((a, b) => a.id - b.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // POST /api/qa - 新增QA
  if (req.method === 'POST') {
    try {
      const records = await getRecords(QA_TABLE_ID);
      const maxId = records.reduce((m, r) => Math.max(m, Number(r.fields.item_id) || 0), 0);
      const newId = maxId + 1;
      const item = { id: newId, created: Date.now(), ...req.body };
      await feishuApi('POST', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/batch_create`, {
        records: [{ fields: {
          question: item.question || '', answer: item.answer || '', category: item.category || '',
          tags: Array.isArray(item.tags) ? item.tags.join(',') : (item.tags || ''),
          item_id: String(newId), created_at: String(item.created)
        }}]
      });
      res.status(200).json({ id: newId });
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
