const { feishuApi, getRecords, CONFIG_TABLE_ID, BASE_TOKEN } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const configRecords = await getRecords(CONFIG_TABLE_ID);
    const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
    if (passRecord) {
      await feishuApi('PUT', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CONFIG_TABLE_ID}/records/${passRecord.record_id}`, {
        fields: { key: 'admin_pass', value: req.body.password }
      });
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
