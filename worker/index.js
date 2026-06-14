// 小狮子助手 - 飞书多维表格 API 代理（Cloudflare Worker）
const APP_ID = 'cli_aaa47b28ed38dbb5';
const APP_SECRET = 'mMHqs3xNG6oiXVWxY20NhecHwA51bqmA';
const BASE_TOKEN = 'FZHdbV0UdaTikVs2uYfcuL15nbd';
const QA_TABLE = 'tbl5GAOHrPPmrcTo';
const CAT_TABLE = 'tblMKdfwvELkpvuE';
const CONFIG_TABLE = 'tblPIifUx46A4Yf9';

const BASE_URL = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}`;

let cachedToken = null;
let tokenExpire = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpire) return cachedToken;
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error(`token error: ${d.msg}`);
  cachedToken = d.tenant_access_token;
  tokenExpire = Date.now() + (d.expire - 120) * 1000;
  return cachedToken;
}

function feishu(method, url, body) {
  return getToken().then(token =>
    fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json()).then(d => {
      if (d.code !== 0) throw new Error(`feishu error(${d.code}): ${d.msg}`);
      return d.data;
    })
  );
}

async function getAllRecords(tableId) {
  const items = [];
  let pt = undefined;
  do {
    const url = `${BASE_URL}/tables/${tableId}/records?page_size=500${pt ? '&page_token=' + pt : ''}`;
    const d = await feishu('GET', url);
    items.push(...(d.items || []));
    pt = d.has_more ? d.page_token : undefined;
  } while (pt);
  return items;
}

function toQA(r) {
  const f = r.fields;
  return {
    id: Number(f.item_id)||0, question:f.question||'', answer:f.answer||'',
    category:f.category||'', tags:(typeof f.tags==='string'?f.tags.split(',').map(t=>t.trim()).filter(Boolean):(Array.isArray(f.tags)?f.tags:[])),
    created:Number(f.created_at)||Date.now(), _record_id:r.record_id
  };
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    try {
      // GET /api/store - 获取全部数据
      if (url.pathname === '/api/store' && req.method === 'GET') {
        const [qa, cats, cfg] = await Promise.all([getAllRecords(QA_TABLE), getAllRecords(CAT_TABLE), getAllRecords(CONFIG_TABLE)]);
        const pr = cfg.find(r=>r.fields.key==='admin_pass');
        return json({ qaItems: qa.map(toQA).sort((a,b)=>a.id-b.id), categories: cats.map(r=>r.fields.name||''), adminPass: pr?pr.fields.value:'admin123' });
      }

      // POST /api/store - 全量保存
      if (url.pathname === '/api/store' && req.method === 'POST') {
        const body = await req.json();
        if (Array.isArray(body.qaItems)) {
          const existing = await getAllRecords(QA_TABLE);
          for (const r of existing) await feishu('DELETE', `${BASE_URL}/tables/${QA_TABLE}/records/${r.record_id}`);
          if (body.qaItems.length > 0)
            await feishu('POST', `${BASE_URL}/tables/${QA_TABLE}/records/batch_create`, { records: body.qaItems.map(i=>({fields:{question:i.question||'',answer:i.answer||'',category:i.category||'',tags:Array.isArray(i.tags)?i.tags.join(','):'',item_id:String(i.id),created_at:String(i.created||Date.now())}})) });
        }
        if (Array.isArray(body.categories)) {
          const existing = await getAllRecords(CAT_TABLE);
          for (const r of existing) await feishu('DELETE', `${BASE_URL}/tables/${CAT_TABLE}/records/${r.record_id}`);
          if (body.categories.length > 0)
            await feishu('POST', `${BASE_URL}/tables/${CAT_TABLE}/records/batch_create`, { records: body.categories.map(c=>({fields:{name:c}})) });
        }
        if (body.adminPass) {
          const cfg = await getAllRecords(CONFIG_TABLE);
          const pr = cfg.find(r=>r.fields.key==='admin_pass');
          if (pr) await feishu('PUT', `${BASE_URL}/tables/${CONFIG_TABLE}/records/${pr.record_id}`, { fields:{key:'admin_pass',value:body.adminPass} });
        }
        return json({ ok:true });
      }

      // GET /api/qa
      if (url.pathname === '/api/qa' && req.method === 'GET') {
        const recs = await getAllRecords(QA_TABLE);
        return json(recs.map(toQA).sort((a,b)=>a.id-b.id));
      }

      // POST /api/qa
      if (url.pathname === '/api/qa' && req.method === 'POST') {
        const item = await req.json();
        const recs = await getAllRecords(QA_TABLE);
        const maxId = recs.reduce((m,r)=>Math.max(m,Number(r.fields.item_id)||0),0)+1;
        await feishu('POST', `${BASE_URL}/tables/${QA_TABLE}/records/batch_create`, { records:[{fields:{question:item.question||'',answer:item.answer||'',category:item.category||'',tags:Array.isArray(item.tags)?item.tags.join(','):'',item_id:String(maxId),created_at:String(Date.now())}}] });
        return json({ id:maxId });
      }

      // PUT /api/qa/:id
      const qaMatch = url.pathname.match(/^\/api\/qa\/(\d+)$/);
      if (qaMatch && req.method === 'PUT') {
        const id=Number(qaMatch[1]), upd=await req.json();
        const recs = await getAllRecords(QA_TABLE);
        const rec = recs.find(r=>Number(r.fields.item_id)===id);
        if (!rec) return err('not found',404);
        await feishu('PUT', `${BASE_URL}/tables/${QA_TABLE}/records/${rec.record_id}`, { fields:{question:upd.question||'',answer:upd.answer||'',category:upd.category||'',tags:Array.isArray(upd.tags)?upd.tags.join(','):'',item_id:String(id),created_at:String(upd.created||Date.now())}});
        return json({ok:true});
      }

      // DELETE /api/qa/:id
      if (qaMatch && req.method === 'DELETE') {
        const id=Number(qaMatch[1]);
        const recs = await getAllRecords(QA_TABLE);
        const rec = recs.find(r=>Number(r.fields.item_id)===id);
        if (!rec) return err('not found',404);
        await feishu('DELETE', `${BASE_URL}/tables/${QA_TABLE}/records/${rec.record_id}`);
        return json({ok:true});
      }

      // GET /api/categories
      if (url.pathname === '/api/categories' && req.method === 'GET')
        return json((await getAllRecords(CAT_TABLE)).map(r=>r.fields.name||''));

      // POST /api/categories
      if (url.pathname === '/api/categories' && req.method === 'POST') {
        const {name}=await req.json();
        const recs=await getAllRecords(CAT_TABLE);
        if (!recs.some(r=>r.fields.name===name))
          await feishu('POST',`${BASE_URL}/tables/${CAT_TABLE}/records/batch_create`,{records:[{fields:{name}}]});
        return json({ok:true});
      }

      // DELETE /api/categories/:name
      const catMatch=url.pathname.match(/^\/api\/categories\/(.+)$/);
      if (catMatch && req.method === 'DELETE') {
        const name=decodeURIComponent(catMatch[1]);
        const recs=await getAllRecords(CAT_TABLE);
        const rec=recs.find(r=>r.fields.name===name);
        if(rec) await feishu('DELETE',`${BASE_URL}/tables/${CAT_TABLE}/records/${rec.record_id}`);
        return json({ok:true});
      }

      // PUT /api/qa/reorder
      if (url.pathname==='/api/qa/reorder'&&req.method==='PUT'){
        const {orderedIds}=await req.json();
        const recs=await getAllRecords(QA_TABLE);
        const map=new Map(recs.map(r=>[Number(r.fields.item_id),r]));
        for(let i=0;i<orderedIds.length;i++){
          const r=map.get(orderedIds[i]);
          if(r) await feishu('PUT',`${BASE_URL}/tables/${QA_TABLE}/records/${r.record_id}`,{fields:{item_id:String(i+1)}});
        }
        return json({ok:true});
      }

      // POST /api/login
      if (url.pathname==='/api/login'&&req.method==='POST'){
        const p=(await req.json()).password;
        const cfg=await getAllRecords(CONFIG_TABLE);
        const pr=cfg.find(r=>r.fields.key==='admin_pass');
        return json({ok:p===(pr?pr.fields.value:'admin123')});
      }

      // PUT /api/password
      if (url.pathname==='/api/password'&&req.method==='PUT'){
        const pw=(await req.json()).password;
        const cfg=await getAllRecords(CONFIG_TABLE);
        const pr=cfg.find(r=>r.fields.key==='admin_pass');
        if(pr) await feishu('PUT',`${BASE_URL}/tables/${CONFIG_TABLE}/records/${pr.record_id}`,{fields:{key:'admin_pass',value:pw}});
        return json({ok:true});
      }

      return err('not found', 404);
    } catch(e) {
      console.error('Worker error:', e);
      return err(e.message, 500);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(d){return Response.json(d,{headers:corsHeaders()})}
function err(msg,status){return Response.json({error:msg},{status,headers:corsHeaders()})}
