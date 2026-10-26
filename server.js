/**
 * 织带场景图生成工具 · 本地服务
 * 支持双供应商：Google Gemini（Nano Banana 系列）/ OpenAI GPT Image
 * API Key 与代理均可在页面上填写，保存后写入本地 .env
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'output');
const ENV_FILE = path.join(ROOT, '.env');

// ---------- 配置 ----------
const CONFIG = {
  provider: '',
  openaiKey: '',
  geminiKey: '',
  openaiModel: 'gpt-image-2',
  geminiModel: 'gemini-2.5-flash-image',
  proxyUrl: '',
  host: '127.0.0.1',
  port: 8787,
};

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, '').trim();
    if (m[1] === 'PROVIDER') CONFIG.provider = v.toLowerCase();
    if (m[1] === 'OPENAI_API_KEY') CONFIG.openaiKey = v;
    if (m[1] === 'GEMINI_API_KEY') CONFIG.geminiKey = v;
    if (m[1] === 'OPENAI_IMAGE_MODEL' && v) CONFIG.openaiModel = v;
    if (m[1] === 'GEMINI_IMAGE_MODEL' && v) CONFIG.geminiModel = v;
    if (m[1] === 'PROXY_URL') CONFIG.proxyUrl = v;
    if (m[1] === 'HOST' && v) CONFIG.host = v;
    if (m[1] === 'PORT' && v) CONFIG.port = Number(v) || 8787;
  }
}

function saveEnv() {
  const lines = [
    '# 本文件由页面「API 设置」自动写入，也可手动编辑',
    `PROVIDER=${CONFIG.provider}`,
    `GEMINI_API_KEY=${CONFIG.geminiKey}`,
    `GEMINI_IMAGE_MODEL=${CONFIG.geminiModel}`,
    `OPENAI_API_KEY=${CONFIG.openaiKey}`,
    `OPENAI_IMAGE_MODEL=${CONFIG.openaiModel}`,
    `PROXY_URL=${CONFIG.proxyUrl}`,
    `HOST=${CONFIG.host}`,
    `PORT=${CONFIG.port}`,
    '',
  ];
  fs.writeFileSync(ENV_FILE, lines.join('\n'), { mode: 0o600 });
}

// macOS 自动读取系统代理
function detectSystemProxy() {
  if (process.platform !== 'darwin') return '';
  try {
    const out = execSync('scutil --proxy', { encoding: 'utf8', timeout: 3000 });
    const enabled = /HTTPSEnable\s*:\s*1/.test(out);
    const host = /HTTPSProxy\s*:\s*([^\s]+)/.exec(out)?.[1];
    const port = /HTTPSPort\s*:\s*(\d+)/.exec(out)?.[1];
    if (enabled && host && port) return `http://${host}:${port}`;
  } catch (_) {}
  return '';
}

loadEnv();
if (!CONFIG.proxyUrl) {
  const auto = detectSystemProxy();
  if (auto) {
    CONFIG.proxyUrl = auto;
    console.log(`  已自动检测到系统代理: ${auto}`);
  }
}

// ---------- 代理请求封装 ----------
let undici = null;
let dispatcher = null;
let dispatcherFor = '';

function getDispatcher() {
  if (!CONFIG.proxyUrl) return null;
  if (!undici) undici = require('undici');
  if (!dispatcher || dispatcherFor !== CONFIG.proxyUrl) {
    dispatcher = new undici.ProxyAgent(CONFIG.proxyUrl);
    dispatcherFor = CONFIG.proxyUrl;
  }
  return dispatcher;
}

function apiFetch(url, opts = {}) {
  const d = getDispatcher();
  if (!d) return fetch(url, opts);
  return undici.fetch(url, { ...opts, dispatcher: d });
}

function buildMultipart(fields, file) {
  const boundary = '----ribbonscene' + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  parts.push(file.buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ---------- 模型目录与价格（人民币/张）----------
const MODEL_CATALOG = {
  gemini: {
    'gemini-2.5-flash-image': { label: 'Nano Banana · 快且便宜', price: { low: 0.28, medium: 0.28, high: 0.28 }, fixedQuality: true },
    'gemini-3.1-flash-image': { label: 'Nano Banana 2 · 均衡', price: { low: 0.48, medium: 0.48, high: 0.48 }, fixedQuality: true },
    'gemini-3-pro-image-preview': { label: 'Nano Banana Pro · 织字最强', price: { low: 0.96, medium: 0.96, high: 0.96 } },
  },
  openai: {
    'gpt-image-2': { label: 'GPT Image 2 · 构图与排版强', price: { low: 0.04, medium: 0.38, high: 1.52 } },
    'gpt-image-1-mini': { label: 'GPT Image 1 mini · 经济', price: { low: 0.04, medium: 0.08, high: 0.26 } },
  },
};

/**
 * 解析本次请求使用的供应商配置
 * 优先级：请求里带的（个人 Key）> 服务器已保存的（共用 Key）
 */
function resolveProvider(o = {}) {
  const provider = o.provider === 'openai' || o.provider === 'gemini'
    ? o.provider
    : (CONFIG.provider || (CONFIG.geminiKey ? 'gemini' : 'openai'));

  if (provider === 'openai') {
    const model = MODEL_CATALOG.openai[o.model] ? o.model : (MODEL_CATALOG.openai[CONFIG.openaiModel] ? CONFIG.openaiModel : 'gpt-image-2');
    const meta = MODEL_CATALOG.openai[model];
    const key = o.key || CONFIG.openaiKey;
    return { name: 'openai', key, model, price: meta.price, fixedQuality: false, fromRequest: Boolean(o.key) };
  }
  const model = MODEL_CATALOG.gemini[o.model] ? o.model : (MODEL_CATALOG.gemini[CONFIG.geminiModel] ? CONFIG.geminiModel : 'gemini-2.5-flash-image');
  const meta = MODEL_CATALOG.gemini[model];
  const key = o.key || CONFIG.geminiKey;
  return { name: 'gemini', key, model, price: meta.price, fixedQuality: Boolean(meta.fixedQuality), fromRequest: Boolean(o.key) };
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return k.slice(0, 2) + '***';
  return k.slice(0, 6) + '…' + k.slice(-4);
}

function statusPayload() {
  const p = resolveProvider();
  return {
    ok: true,
    provider: p.name,
    model: p.model,
    hasKey: Boolean(p.key),
    price: p.price,
    fixedQuality: p.fixedQuality,
    proxy: CONFIG.proxyUrl,
    host: CONFIG.host,
    shared: CONFIG.host !== '127.0.0.1' && CONFIG.host !== 'localhost',
    serverKeys: { gemini: maskKey(CONFIG.geminiKey), openai: maskKey(CONFIG.openaiKey) },
    models: MODEL_CATALOG,
    styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.name])),
  };
}

// ---------- 风格模板库 ----------
const BASE_RULE = `Use ONLY the ribbon shown in the reference image as the ribbon material. ` +
  `Keep its exact colors, printed or woven pattern, motif scale and spacing, and any letters or logo text ` +
  `identical to the reference. Text must read correctly, never mirrored, never misspelled. ` +
  `Show realistic woven/elastic fabric texture with visible edge detail. `;

const STYLES = {
  bold_color: {
    name: '高级撞色礼盒',
    prompt: BASE_RULE + `Premium e-commerce product photo, top-down 45 degree view. A matte cream gift box on a solid bold colored seamless backdrop, ` +
      `wrapped with this ribbon crossing diagonally with a crisp neat bow at one corner. Studio soft lighting, subtle shadow, minimal luxury styling, high detail.`,
  },
  luxury_dark: {
    name: '黑白轻奢礼盒堆',
    prompt: BASE_RULE + `Luxury fashion brand style product photo. Two stacked matte white gift boxes on a dark reflective black stone surface with dark background, ` +
      `the top box tied with this ribbon in a clean bow, a band of the same ribbon around the lower box. Dramatic directional studio lighting, high contrast, premium editorial look.`,
  },
  bakery_festive: {
    name: '节日烘焙包装',
    prompt: BASE_RULE + `Cozy lifestyle product photo. A kraft cookie box with a clear window filled with decorated cookies, wrapped with this ribbon in a bow, ` +
      `placed on a wooden kitchen counter with scattered flour, cinnamon sticks and a linen cloth. Warm natural window light, shallow depth of field, appetizing homemade feel.`,
  },
  new_chinese: {
    name: '新中式礼盒',
    prompt: BASE_RULE + `Elegant Chinese-style gift photo. A deep red lacquered gift box with subtle gold trim on a dark green textured backdrop, ` +
      `tied with this ribbon in a refined bow, a small silk tassel accent beside it. Soft moody lighting, oriental luxury aesthetic, high detail.`,
  },
  christmas: {
    name: '圣诞礼盒包装',
    prompt: BASE_RULE + `Festive holiday product photo. A kraft paper wrapped gift box tied with this ribbon in a full bow, ` +
      `placed on a rustic wooden table with pine branches, dried orange slices, and a Christmas tree with warm bokeh lights behind. Cozy warm lighting, shallow depth of field.`,
  },
  soft_paper: {
    name: '柔调纸品组合',
    prompt: BASE_RULE + `Soft pastel flat-lay product photo. Assorted tissue paper, small boxes and folded paper sheets in cream and light tones arranged neatly, ` +
      `this ribbon draped and tied around one small box in a loose bow. Even soft daylight, gentle shadows, clean minimal e-commerce styling, top view.`,
  },
  product_wrap: {
    name: '产品包覆展示',
    prompt: BASE_RULE + `Commercial product photo showing the ribbon used to decorate real merchandise. A stylish suitcase (or similar lifestyle product) ` +
      `on a bold solid color background, this ribbon wrapped around its handle and body with a neat bow. Crisp studio lighting, strong graphic composition, retail catalog quality.`,
  },
  bow_macro: {
    name: '蝴蝶结特写',
    prompt: BASE_RULE + `Macro close-up product photo of a beautifully tied bow made of this ribbon, filling most of the frame, ` +
      `on a smooth matte neutral background. Extremely sharp focus on the weave texture and printed detail, soft studio light, shallow depth of field, premium detail shot.`,
  },
};

const VARIATIONS = [
  'Vary the composition slightly: different camera angle and box placement, keep the same style and lighting mood.',
  'Vary the styling: add a small complementary prop and shift the framing a little, same style and mood.',
  'Vary the light: slightly warmer and softer lighting, gentle shift in composition, same style.',
];

// ---------- 工具函数 ----------
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('图片过大，请压缩后再试')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('图片格式无法识别');
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

function saveImage(b64, styleKey) {
  const file = `${styleKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(b64, 'base64'));
  return file;
}

// ---------- 网络与 Key 校验 ----------
async function verifyKey(provider, key) {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/models'
    : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  try {
    const r = await apiFetch(url, provider === 'openai' ? { headers: { Authorization: `Bearer ${key}` } } : {});
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'Key 无效或无权限（' + r.status + '）' };
    if (r.status === 400) return { ok: false, error: 'Key 无效（400）' };
    return { ok: false, error: `校验失败（${r.status}）` };
  } catch (e) {
    return { ok: false, error: '网络不通：' + (e.cause?.code || e.message) + '（需配置代理或中转地址）' };
  }
}

async function netcheck() {
  const targets = [
    ['OpenAI', 'https://api.openai.com/v1/models'],
    ['Gemini', 'https://generativelanguage.googleapis.com/v1beta/models'],
  ];
  const out = [];
  for (const [name, url] of targets) {
    const t0 = Date.now();
    try {
      const r = await apiFetch(url, { signal: AbortSignal.timeout(8000) });
      out.push({ name, ok: r.status < 500, status: r.status, ms: Date.now() - t0 });
    } catch (e) {
      out.push({ name, ok: false, status: 0, ms: Date.now() - t0, error: e.cause?.code || e.message });
    }
  }
  return out;
}

// ---------- OpenAI 生成 ----------
async function callOpenAI(ctx, { buffer, mime, prompt, quality, size }) {
  const p = ctx;
  const { body, contentType } = buildMultipart({
    model: p.model,
    prompt,
    size: size || '1024x1024',
    quality: quality || 'medium',
    n: '1',
    output_format: 'png',
  }, { name: 'image', filename: 'ribbon.png', type: mime, buffer });

  const resp = await apiFetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': contentType },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    let msg = text;
    try { const j = JSON.parse(text); msg = j.error?.message || text; } catch (_) {}
    throw new Error(`${resp.status}: ${msg}`);
  }
  const data = await resp.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('接口未返回图片');
  return b64;
}

// ---------- Gemini 生成 ----------
function aspectFromSize(size) {
  if (size === '1024x1536') return '2:3';
  if (size === '1536x1024') return '3:2';
  return '1:1';
}

async function callGemini(ctx, { buffer, mime, prompt, quality, size }) {
  const p = ctx;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${p.key}`;
  const imageConfig = { aspectRatio: aspectFromSize(size) };
  if (/pro-image|3\.1/.test(p.model) && quality === 'high') imageConfig.imageSize = '2K';

  const body = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mime, data: buffer.toString('base64') } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
  });

  const resp = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    let msg = text;
    try { const j = JSON.parse(text); msg = j.error?.message || text; } catch (_) {}
    throw new Error(`${resp.status}: ${msg}`);
  }
  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const img = parts.find((x) => x.inlineData || x.inline_data);
  const b64 = img?.inlineData?.data || img?.inline_data?.data;
  if (!b64) {
    const txt = parts.filter((x) => x.text).map((x) => x.text).join(' ');
    throw new Error(txt ? `模型未出图：${txt.slice(0, 120)}` : '未返回图片（可能被安全策略拦截）');
  }
  return b64;
}

// ---------- 统一生成 ----------
async function generateOne(ctx, { buffer, mime, styleKey, quality, size, variation }) {
  const style = STYLES[styleKey];
  if (!style) throw new Error('未知风格: ' + styleKey);
  const prompt = variation ? style.prompt + ' ' + VARIATIONS[variation % VARIATIONS.length] : style.prompt;

  const args = { buffer, mime, prompt, quality, size };
  const b64 = ctx.name === 'openai' ? await callOpenAI(ctx, args) : await callGemini(ctx, args);
  const file = saveImage(b64, styleKey);
  return { styleKey, styleName: style.name, url: `/output/${file}` };
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------- 静态文件 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- 服务 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/status') {
    return sendJSON(res, 200, statusPayload());
  }

  if (req.method === 'GET' && url.pathname === '/api/netcheck') {
    const px = url.searchParams.get('proxy');
    if (px !== null) CONFIG.proxyUrl = px.trim();
    try { return sendJSON(res, 200, { proxy: CONFIG.proxyUrl, results: await netcheck() }); }
    catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // 个人 Key 校验（不落盘，仅用于判断能不能用）
  if (req.method === 'POST' && url.pathname === '/api/verify') {
    try {
      const raw = await readBody(req, 1024 * 1024);
      const body = JSON.parse(raw.toString('utf8'));
      const provider = body.provider === 'openai' ? 'openai' : 'gemini';
      const key = (body.key || '').trim();
      if (!key) return sendJSON(res, 400, { error: '请填写 API Key' });
      if (typeof body.proxy === 'string' && body.proxy.trim()) CONFIG.proxyUrl = body.proxy.trim();

      if (!CONFIG.proxyUrl) {
        const probe = await netcheck();
        if (probe.every((x) => !x.ok)) {
          return sendJSON(res, 400, { error: '网络不通：本机无法直连 ' + probe.map((x) => x.name).join(' / ') + '。请填写代理地址（如 http://127.0.0.1:7890）后重试' });
        }
      }
      const v = await verifyKey(provider, key);
      if (!v.ok) return sendJSON(res, 400, { error: v.error });
      return sendJSON(res, 200, { ok: true, model: provider === 'openai' ? CONFIG.openaiModel : CONFIG.geminiModel });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message || String(e) });
    }
  }

  // 服务器级设置（代理、默认模型、可选的共用 Key）
  if (req.method === 'POST' && url.pathname === '/api/config') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8'));
      const provider = body.provider === 'openai' || body.provider === 'gemini' ? body.provider : resolveProvider().name;

      if (typeof body.proxy === 'string') CONFIG.proxyUrl = body.proxy.trim();

      if (body.model) {
        const catalog = MODEL_CATALOG[provider];
        if (catalog && catalog[body.model]) {
          if (provider === 'openai') CONFIG.openaiModel = body.model;
          else CONFIG.geminiModel = body.model;
        }
      }

      let verify = { ok: true };
      const key = (body.key || '').trim();
      if (key) {
        verify = await verifyKey(provider, key);
        if (!verify.ok) return sendJSON(res, 400, { error: verify.error });
        if (provider === 'openai') CONFIG.openaiKey = key;
        else CONFIG.geminiKey = key;
      }

      CONFIG.provider = provider;
      saveEnv();
      return sendJSON(res, 200, { ...statusPayload(), verified: Boolean(key) });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message || String(e) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8'));

      // 优先使用请求里带的个人 Key
      const ctx = resolveProvider({ provider: body.provider, model: body.model, key: (body.key || '').trim() });
      if (!ctx.key) {
        return sendJSON(res, 400, { error: '还没有填写你自己的 API Key，请点右上角「API 设置」填写（只保存在你的浏览器里）' });
      }

      const { buffer, mime } = parseDataUrl(body.image);
      const styles = Array.isArray(body.styles) ? body.styles : [];
      if (!styles.length) return sendJSON(res, 400, { error: '请至少选择一种风格' });

      const results = await pool(styles, 2, (styleKey) =>
        generateOne(ctx, { buffer, mime, styleKey, quality: body.quality, size: body.size, variation: body.variation })
          .catch((e) => ({ styleKey, styleName: STYLES[styleKey]?.name || styleKey, error: e.message }))
      );
      return sendJSON(res, 200, { results, provider: ctx.name, model: ctx.model });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message || String(e) });
    }
  }

  if (req.method === 'GET') return serveStatic(req, res, url.pathname);

  res.writeHead(405); res.end('Method not allowed');
});

server.listen(CONFIG.port, CONFIG.host, () => {
  const p = resolveProvider();
  const lan = Object.values(require('os').networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`\n  织带场景图工具已启动 → http://${CONFIG.host === '0.0.0.0' ? '127.0.0.1' : CONFIG.host}:${CONFIG.port}`);
  if (CONFIG.host === '0.0.0.0' && lan) console.log(`  局域网共享地址 → http://${lan.address}:${CONFIG.port}（同学可用此地址打开）`);
  console.log(`  供应商: ${p.name}    模型: ${p.model}`);
  console.log(`  代理: ${CONFIG.proxyUrl || '未设置（直连）'}`);
  console.log(`  服务器共用 Key: OpenAI ${CONFIG.openaiKey ? '已配置' : '无'} / Gemini ${CONFIG.geminiKey ? '已配置' : '无'}（页面填写的个人 Key 不落盘）\n`);
});
