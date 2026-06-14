const { feishuApi, getRecords, recordToQA, QA_TABLE_ID, BASE_TOKEN } = require('../api/_lib');

module.exports = async function handler(req, res) {
  // Vercel serverless doesn't support [id] dynamic routes easily,
  // so we use /api/qa-item?id=X
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // PUT - 更新QA
  if (req.method === 'PUT') {
    try {
      const records = await getRecords(QA_TABLE_ID);
      const rec = records.find(r => Number(r.fields.item_id) === id);
      if (!rec) return res.status(404).json({ error: 'not found' });
      const updated = { ...req.body, id };
      await feishuApi('PUT', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/${rec.record_id}`, {
        fields: {
          question: updated.question || '', answer: updated.answer || '', category: updated.category || '',
          tags: Array.isArray(updated.tags) ? updated.tags.join(',') : (updated.tags || ''),
          item_id: String(updated.id), created_at: String(updated.created || Date.now())
        }
      });
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // DELETE - 删除QA
  if (req.method === 'DELETE') {
    try {
      const records = await getRecords(QA_TABLE_ID);
      const rec = records.find(r => Number(r.fields.item_id) === id);
      if (!rec) return res.status(404).json({ error: 'not found' });
      await feishuApi('DELETE', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/${rec.record_id}`);
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
