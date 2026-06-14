// 飞书 API 工具模块（Vercel Serverless 共享）
const APP_ID = process.env.FEISHU_APP_ID || 'cli_aaa47b28ed38dbb5';
const APP_SECRET = process.env.FEISHU_APP_SECRET || 'mMHqs3xNG6oiXVWxY20NhecHwA51bqmA';
const BASE_TOKEN = 'FZHdbV0UdaTikVs2uYfcuL15nbd';
const QA_TABLE_ID = 'tbl5GAOHrPPmrcTo';
const CAT_TABLE_ID = 'tblMKdfwvELkpvuE';
const CONFIG_TABLE_ID = 'tblPIifUx46A4Yf9';

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
  tokenExpireAt = Date.now() + (data.expire - 60) * 1000;
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

module.exports = {
  APP_ID, APP_SECRET, BASE_TOKEN,
  QA_TABLE_ID, CAT_TABLE_ID, CONFIG_TABLE_ID,
  getToken, feishuApi, getRecords, recordToQA
};
