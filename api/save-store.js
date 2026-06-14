const { feishuApi, getRecords, recordToQA, QA_TABLE_ID, CAT_TABLE_ID, CONFIG_TABLE_ID, BASE_TOKEN } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { qaItems, categories, adminPass } = req.body;

    // 清空并重写 QA
    if (Array.isArray(qaItems)) {
      const existingQA = await getRecords(QA_TABLE_ID);
      for (const rec of existingQA) {
        await feishuApi('DELETE', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/${rec.record_id}`);
      }
      if (qaItems.length > 0) {
        await feishuApi('POST', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/batch_create`, {
          records: qaItems.map(item => ({
            fields: {
              question: item.question || '', answer: item.answer || '', category: item.category || '',
              tags: Array.isArray(item.tags) ? item.tags.join(',') : (item.tags || ''),
              item_id: String(item.id), created_at: String(item.created || Date.now())
            }
          }))
        });
      }
    }

    // 清空并重写分类
    if (Array.isArray(categories)) {
      const existingCats = await getRecords(CAT_TABLE_ID);
      for (const rec of existingCats) {
        await feishuApi('DELETE', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CAT_TABLE_ID}/records/${rec.record_id}`);
      }
      if (categories.length > 0) {
        await feishuApi('POST', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CAT_TABLE_ID}/records/batch_create`, {
          records: categories.map(c => ({ fields: { name: c } }))
        });
      }
    }

    // 更新密码
    if (adminPass) {
      const configRecords = await getRecords(CONFIG_TABLE_ID);
      const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
      if (passRecord) {
        await feishuApi('PUT', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CONFIG_TABLE_ID}/records/${passRecord.record_id}`, {
          fields: { key: 'admin_pass', value: adminPass }
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
