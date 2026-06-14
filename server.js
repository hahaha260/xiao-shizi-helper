const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 飞书应用凭证 =====
const APP_ID = process.env.FEISHU_APP_ID || 'cli_aaa47b28ed38dbb5';
const APP_SECRET = process.env.FEISHU_APP_SECRET || 'mMHqs3xNG6oiXVWxY20NhecHwA51bqmA';
const BASE_TOKEN = 'FZHdbV0UdaTikVs2uYfcuL15nbd';
const QA_TABLE_ID = 'tbl5GAOHrPPmrcTo';
const CAT_TABLE_ID = 'tblMKdfwvELkpvuE';
const CONFIG_TABLE_ID = 'tblPIifUx46A4Yf9';

// ===== 飞书 API =====
let cachedToken = null;
let tokenExpireAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpireAt) return cachedToken;
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取token失败: ${data.msg}`);
  cachedToken = data.tenant_access_token;
  tokenExpireAt = Date.now() + (data.expire - 60) * 1000; // 提前1分钟刷新
  return cachedToken;
}

async function feishuApi(method, url, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`飞书API错误(${data.code}): ${data.msg}`);
  return data.data;
}

// 获取所有记录
async function getRecords(tableId) {
  const all = [];
  let pageToken = undefined;
  do {
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records?page_size=500`;
    if (pageToken) url += `&page_token=${pageToken}`;
    const data = await feishuApi('GET', url);
    all.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return all;
}

function recordToQA(rec) {
  const f = rec.fields;
  return {
    id: Number(f.item_id) || 0,
    question: f.question || '',
    answer: f.answer || '',
    category: f.category || '',
    tags: typeof f.tags === 'string' ? f.tags.split(',').map(t => t.trim()).filter(Boolean) : (Array.isArray(f.tags) ? f.tags : []),
    created: Number(f.created_at) || Date.now(),
    _record_id: rec.record_id
  };
}

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== API 路由 =====

app.get('/api/store', async (req, res) => {
  try {
    const [qaRecords, catRecords, configRecords] = await Promise.all([
      getRecords(QA_TABLE_ID), getRecords(CAT_TABLE_ID), getRecords(CONFIG_TABLE_ID)
    ]);
    const qaItems = qaRecords.map(recordToQA).sort((a, b) => a.id - b.id);
    const categories = catRecords.map(r => r.fields.name || '');
    const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
    const adminPass = passRecord ? passRecord.fields.value : 'admin123';
    res.json({ qaItems, categories, adminPass });
  } catch (e) {
    console.error('GET /api/store error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/store', async (req, res) => {
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

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/store error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/qa', async (req, res) => {
  try {
    const records = await getRecords(QA_TABLE_ID);
    res.json(records.map(recordToQA).sort((a, b) => a.id - b.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/qa', async (req, res) => {
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

    res.json({ id: newId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/qa/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
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
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/qa/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const records = await getRecords(QA_TABLE_ID);
    const rec = records.find(r => Number(r.fields.item_id) === id);
    if (!rec) return res.status(404).json({ error: 'not found' });
    await feishuApi('DELETE', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${QA_TABLE_ID}/records/${rec.record_id}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/categories', async (req, res) => {
  try {
    const records = await getRecords(CAT_TABLE_ID);
    res.json(records.map(r => r.fields.name || ''));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const records = await getRecords(CAT_TABLE_ID);
    const existing = records.map(r => r.fields.name);
    if (!existing.includes(name)) {
      await feishuApi('POST', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CAT_TABLE_ID}/records/batch_create`, {
        records: [{ fields: { name } }]
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categories/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const records = await getRecords(CAT_TABLE_ID);
    const rec = records.find(r => r.fields.name === name);
    if (rec) {
      await feishuApi('DELETE', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CAT_TABLE_ID}/records/${rec.record_id}`);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/qa/reorder', async (req, res) => {
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
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const configRecords = await getRecords(CONFIG_TABLE_ID);
    const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
    const adminPass = passRecord ? passRecord.fields.value : 'admin123';
    res.json({ ok: req.body.password === adminPass });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/password', async (req, res) => {
  try {
    const configRecords = await getRecords(CONFIG_TABLE_ID);
    const passRecord = configRecords.find(r => r.fields.key === 'admin_pass');
    if (passRecord) {
      await feishuApi('PUT', `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${CONFIG_TABLE_ID}/records/${passRecord.record_id}`, {
        fields: { key: 'admin_pass', value: req.body.password }
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`小狮子助手已启动: http://localhost:${PORT}`);
  console.log(`数据存储: 飞书多维表格 (${BASE_TOKEN})`);
});
