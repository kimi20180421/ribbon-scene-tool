import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Divider, Grid, Image, Input, Link, Message,
  Modal, Radio, Select, Space, Spin, Tag, Typography, Upload,
} from '@arco-design/web-react';
import { IconSearch, IconSettings, IconSync, IconUpload } from '@arco-design/web-react/icon';

const { Row, Col } = Grid;
const { Text, Title } = Typography;

// ---------- 风格模板 ----------
const STYLES = [
  { k: 'bold_color', name: '高级撞色礼盒', desc: '纯色背景 · 对角绕带 · 俯拍' },
  { k: 'luxury_dark', name: '黑白轻奢礼盒堆', desc: '深色反光台面 · 白盒堆叠' },
  { k: 'bakery_festive', name: '节日烘焙包装', desc: '饼干盒 · 木质台面 · 生活感' },
  { k: 'new_chinese', name: '新中式礼盒', desc: '红漆盒 · 深绿撞色 · 国风' },
  { k: 'christmas', name: '圣诞礼盒包装', desc: '树灯背景 · 牛皮纸 · 氛围' },
  { k: 'soft_paper', name: '柔调纸品组合', desc: '雪梨纸 · 平铺排版 · 电商' },
  { k: 'product_wrap', name: '产品包覆展示', desc: '箱包实物包带 · 撞色背景' },
  { k: 'bow_macro', name: '蝴蝶结特写', desc: '微距 · 突出织字与织纹' },
];

// ---------- 本机存储（Key 只在各自浏览器） ----------
const LS = {
  key: (p) => `ribbon_key_${p}`,
  model: (p) => `ribbon_model_${p}`,
  provider: 'ribbon_provider',
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } },
};

const DEFAULT_MODELS = {
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

export default function App() {
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [serverKeys, setServerKeys] = useState({ gemini: '', openai: '' });
  const [proxy, setProxy] = useState('');
  const [ready, setReady] = useState(false);

  const [provider, setProvider] = useState(() => LS.get(LS.provider) || 'gemini');
  const [modelSel, setModelSel] = useState(() => ({
    gemini: LS.get(LS.model('gemini')),
    openai: LS.get(LS.model('openai')),
  }));
  const [selected, setSelected] = useState(['bold_color', 'luxury_dark', 'bakery_festive', 'new_chinese']);
  const [quality, setQuality] = useState('medium');
  const [size, setSize] = useState('1024x1024');
  const [ribbon, setRibbon] = useState(null); // dataURL

  const [results, setResults] = useState([]); // {styleKey, styleName, url?, error?, loading}
  const [generating, setGenerating] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [editProvider, setEditProvider] = useState('gemini');
  const [keyInput, setKeyInput] = useState('');
  const [proxyInput, setProxyInput] = useState('');
  const [modalMsg, setModalMsg] = useState(null); // {type, text}
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const myKey = (p) => LS.get(LS.key(p));
  const modelOf = (p) => modelSel[p] || Object.keys(models[p] || {})[0] || '';
  const effKey = (p) => myKey(p) || serverKeys[p] || '';
  const modelMeta = (p) => (models[p] || {})[modelOf(p)] || null;
  const effPrice = modelMeta(provider)?.price || { low: 0.4, medium: 0.4, high: 0.4 };
  const hasKey = Boolean(effKey(provider));

  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then((d) => {
      if (d.models) setModels(d.models);
      setServerKeys({
        gemini: d.serverKeys?.gemini ? 'server' : '',
        openai: d.serverKeys?.openai ? 'server' : '',
      });
      setProxy(d.proxy || '');
      setProxyInput(d.proxy || '');
      if (!LS.get(LS.provider) && d.provider) setProvider(d.provider);
      setReady(true);
    }).catch(() => {
      Message.error('服务未启动或无法连接');
      setReady(true);
    });
  }, []);

  const cost = useMemo(() => {
    const p = effPrice[quality] ?? 0.4;
    return (selected.length * p).toFixed(1);
  }, [selected, quality, effPrice]);

  // ---------- 上传 ----------
  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1536;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        setRibbon(c.toDataURL('image/jpeg', 0.92));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---------- 生成 ----------
  function buildBody(styles, extra = {}) {
    return JSON.stringify({
      image: ribbon,
      styles,
      provider,
      model: modelOf(provider),
      key: myKey(provider) || '',
      quality,
      size,
      ...extra,
    });
  }

  async function generate() {
    setErrMsg('');
    if (!ribbon) { Message.warning('请先上传一张织带产品图'); return; }
    if (!selected.length) { Message.warning('请至少选择一种风格'); return; }
    if (!hasKey) { Message.warning('还没有填写你自己的 API Key，请点右上角「API 设置」'); setEditProvider(provider); openModal(); return; }

    setGenerating(true);
    setResults(selected.map((k) => ({
      styleKey: k,
      styleName: STYLES.find((s) => s.k === k)?.name || k,
      loading: true,
    })));

    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody(selected),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results.map((x) => ({ ...x, loading: false })));
      const ok = data.results.filter((x) => !x.error).length;
      Message.success(`生成完成：成功 ${ok}/${data.results.length}`);
    } catch (e) {
      setResults((rs) => rs.map((x) => ({ ...x, loading: false })));
      setErrMsg(e.message);
    }
    setGenerating(false);
  }

  async function shuffle(item, idx) {
    setResults((rs) => rs.map((x, i) => (i === idx ? { ...x, loading: true } : x)));
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody([item.styleKey], { variation: (item.variation || 0) + 1 }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      const res = data.results[0];
      if (res.error) throw new Error(res.error);
      setResults((rs) => rs.map((x, i) => (i === idx ? { ...res, variation: (item.variation || 0) + 1 } : x)));
    } catch (e) {
      Message.error(e.message.slice(0, 120));
      setResults((rs) => rs.map((x, i) => (i === idx ? { ...x, loading: false } : x)));
    }
  }

  // ---------- 设置弹窗 ----------
  function openModal() {
    setEditProvider(provider);
    setKeyInput('');
    setProxyInput(proxy);
    setModalMsg(null);
    setModalOpen(true);
  }

  async function saveSettings() {
    const key = keyInput.trim();
    const model = modelOf(editProvider);
    LS.set(LS.model(editProvider), model);
    LS.set(LS.provider, editProvider);
    setProvider(editProvider);

    if (proxyInput.trim() !== proxy) {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: editProvider, model, proxy: proxyInput.trim() }),
      }).catch(() => {});
      setProxy(proxyInput.trim());
    }

    if (!key) {
      setModalMsg({ type: 'success', text: '已保存模型与代理设置（未填写新 Key）' });
      setModalOpen(false);
      return;
    }

    setSaving(true);
    setModalMsg(null);
    try {
      const r = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: editProvider, key, proxy: proxyInput.trim() }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      LS.set(LS.key(editProvider), key);
      setModalMsg({ type: 'success', text: 'Key 验证通过，已保存在你自己的浏览器里' });
      setTimeout(() => setModalOpen(false), 800);
    } catch (e) {
      setModalMsg({ type: 'error', text: e.message });
    }
    setSaving(false);
  }

  async function testNet() {
    setTesting(true);
    setModalMsg({ type: 'success', text: '正在检测网络…' });
    try {
      const r = await fetch(`/api/netcheck?proxy=${encodeURIComponent(proxyInput.trim())}`);
      const d = await r.json();
      const any = d.results.some((x) => x.ok);
      setModalMsg({
        type: any ? 'success' : 'error',
        text: d.results.map((x) => `${x.name}: ${x.ok ? `连通 ${x.ms}ms` : `失败（${x.error || x.status}）`}`).join(' ｜ ')
          + (d.proxy ? ` · 代理 ${d.proxy}` : ' · 未用代理'),
      });
    } catch (e) {
      setModalMsg({ type: 'error', text: `检测失败：${e.message}` });
    }
    setTesting(false);
  }

  // ---------- 渲染 ----------
  const headerStatus = hasKey
    ? <Tag color="green" bordered>{(provider === 'gemini' ? 'Gemini' : 'OpenAI') + ' · ' + (modelOf(provider) || '默认模型') + (myKey(provider) ? '（我的 Key）' : '（共用 Key）')}</Tag>
    : <Tag color="orange" bordered>未填写 Key</Tag>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-fill-1)' }}>
      {/* 顶栏 */}
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--color-border-2)',
        padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, background: 'rgb(var(--primary-6))', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 17, flexShrink: 0,
        }}>织</div>
        <div>
          <Title heading={5} style={{ margin: 0 }}>织带场景图一键生成</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>上传织带图 → 选择风格 → 一键生成场景效果图，不满意单张换一换</Text>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {headerStatus}
          <Button size="small" icon={<IconSettings />} onClick={openModal}>API 设置</Button>
        </div>
      </div>

      {!ready ? (
        <div style={{ textAlign: 'center', padding: 120 }}><Spin size={32} tip="加载中…" /></div>
      ) : (
        <>
          {!hasKey && (
            <div style={{ maxWidth: 1120, margin: '16px auto 0', padding: '0 24px' }}>
              <Alert type="warning" content={
                <span>还没有填写 API Key。每个同学用自己的 Key，只保存在你自己的浏览器里 —— <Link onClick={openModal}>现在填写</Link></span>
              } />
            </div>
          )}

          <Row gutter={20} style={{ maxWidth: 1120, margin: '20px auto', padding: '0 24px' }}>
            {/* 左栏 */}
            <Col xs={24} md={9} lg={8}>
              <Card title="1. 上传织带产品图" size="small" style={{ marginBottom: 16 }}>
                <Upload
                  drag
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => { handleFile(file); return false; }}
                  tip="建议高清正面平铺图，织字清晰"
                >
                  {ribbon ? (
                    <div style={{ padding: 8 }}>
                      <img src={ribbon} alt="ribbon" style={{ maxWidth: '100%', maxHeight: 190, borderRadius: 6 }} />
                      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 8 }}>点击可重新上传</div>
                    </div>
                  ) : (
                    <div style={{ padding: '28px 16px', color: 'var(--color-text-3)' }}>
                      <IconUpload style={{ fontSize: 28 }} />
                      <div>点击或拖入织带图</div>
                      <div style={{ fontSize: 11 }}>支持 jpg / png</div>
                    </div>
                  )}
                </Upload>
              </Card>

              <Card title="2. 选择风格（可多选）" size="small" style={{ marginBottom: 16 }}>
                <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {STYLES.map((s) => (
                    <div
                      key={s.k}
                      onClick={() => setSelected((sel) => sel.includes(s.k) ? sel.filter((x) => x !== s.k) : [...sel, s.k])}
                      style={{
                        border: `1.5px solid ${selected.includes(s.k) ? 'rgb(var(--primary-6))' : 'var(--color-border-2)'}`,
                        background: selected.includes(s.k) ? 'var(--color-primary-light-1)' : '#fff',
                        borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
                      }}
                    >
                      <Checkbox checked={selected.includes(s.k)} onChange={() => {}} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <Row gutter={10} style={{ marginTop: 14 }}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>出图质量</Text>
                    <Select
                      value={quality} onChange={setQuality} style={{ width: '100%', marginTop: 4 }}
                      options={[
                        { label: `标准 medium（约 ¥${effPrice.medium.toFixed(2)}/张）`, value: 'medium', disabled: modelMeta(provider)?.fixedQuality },
                        { label: `高清 high（约 ¥${effPrice.high.toFixed(2)}/张）`, value: 'high', disabled: modelMeta(provider)?.fixedQuality },
                        { label: `快速 low（约 ¥${effPrice.low.toFixed(2)}/张）`, value: 'low', disabled: modelMeta(provider)?.fixedQuality },
                      ].filter((o) => !o.disabled || o.value === 'medium')}
                    />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>画面比例</Text>
                    <Select
                      value={size} onChange={setSize} style={{ width: '100%', marginTop: 4 }}
                      options={[
                        { label: '方图 1:1', value: '1024x1024' },
                        { label: '竖图 2:3', value: '1024x1536' },
                        { label: '横图 3:2', value: '1536x1024' },
                      ]}
                    />
                  </Col>
                </Row>
              </Card>

              <Card size="small">
                <Button type="primary" long size="large" loading={generating} onClick={generate}>一键生成效果图</Button>
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)', marginTop: 8 }}>
                  已选 {selected.length} 种风格 · 预计 {selected.length} 张图 · 约 ¥{cost}
                </div>
              </Card>
            </Col>

            {/* 右栏：结果 */}
            <Col xs={24} md={15} lg={16}>
              <Card title="生成结果" size="small">
                {errMsg && <Alert type="error" content={errMsg} style={{ marginBottom: 14 }} />}
                {!results.length ? (
                  <div style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: '80px 20px', fontSize: 13 }}>
                    上传织带图 → 选择风格 → 点击「一键生成」<br />每张图生成后可单独「换一换」
                  </div>
                ) : (
                  <Row gutter={[14, 14]}>
                    {results.map((res, i) => (
                      <Col xs={24} sm={12} key={res.styleKey + i}>
                        <Card
                          size="mini"
                          title={res.styleName}
                          extra={res.loading
                            ? <Text type="secondary" style={{ fontSize: 12 }}>生成中…</Text>
                            : res.error
                              ? <Tag color="red" size="small">失败</Tag>
                              : <Tag color="green" size="small">完成</Tag>}
                          bodyStyle={{ padding: 0 }}
                        >
                          {res.loading ? (
                            <div style={{ padding: 14 }}>
                              <Spin block style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-fill-1)', borderRadius: 6 }} />
                            </div>
                          ) : res.error ? (
                            <div style={{ padding: 14, color: 'rgb(var(--red-6))', fontSize: 12, minHeight: 180, display: 'flex', alignItems: 'center' }}>
                              {res.error.slice(0, 160)}
                            </div>
                          ) : (
                            <>
                              <Image src={res.url} alt={res.styleName} width="100%" style={{ display: 'block' }} />
                              <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                                <Button size="mini" type="outline" icon={<IconSync />} loading={res.loading} onClick={() => shuffle(res, i)}>换一换</Button>
                              </div>
                            </>
                          )}
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* API 设置弹窗 */}
      <Modal
        title="API 设置"
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        style={{ width: 460 }}
        unmountOnExit
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Key 只保存在你自己的浏览器（localStorage），不会写到服务器，其他同学看不到
        </Text>
        <Divider style={{ margin: '14px 0' }} />
        <Radio.Group
          type="button"
          value={editProvider}
          onChange={(v) => { setEditProvider(v); setKeyInput(''); setModalMsg(null); }}
          options={[
            { label: 'Google Gemini', value: 'gemini' },
            { label: 'OpenAI', value: 'openai' },
          ]}
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>我的 API Key</Text>
            {myKey(editProvider) && (
              <Link style={{ fontSize: 11 }} onClick={() => {
                LS.set(LS.key(editProvider), '');
                setKeyInput('');
                Message.success('已清除本机保存的 Key');
              }}>清除本机 Key</Link>
            )}
          </div>
          <Input.Password
            value={keyInput}
            onChange={setKeyInput}
            placeholder={myKey(editProvider)
              ? `本机已保存：${myKey(editProvider).slice(0, 6)}…${myKey(editProvider).slice(-4)}，留空保留`
              : (serverKeys[editProvider] ? '本机未保存，当前用共用 Key；填写后优先用你自己的' : '粘贴你自己的 API Key')}
            autoComplete="off"
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {editProvider === 'gemini'
              ? <>申请地址：<Link href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</Link></>
              : <>申请地址：<Link href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</Link></>}
          </Text>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>图像模型</Text>
          <Select
            value={modelOf(editProvider)}
            onChange={(v) => { LS.set(LS.model(editProvider), v); setModelSel((s) => ({ ...s, [editProvider]: v })); }}
            style={{ width: '100%' }}
            options={Object.entries(models[editProvider] || {}).map(([id, m]) => ({
              label: `${m.label} · 约 ¥${m.price.medium.toFixed(2)}/张`, value: id,
            }))}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>模型选择也会记住在本机</Text>
        </div>
        <Divider style={{ margin: '14px 0' }} />
        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>网络代理（这台机器的公共设置）</Text>
          <Link style={{ fontSize: 11 }} onClick={testNet} disabled={testing}>{testing ? '检测中…' : '检测网络连通性'}</Link>
        </div>
        <Input
          value={proxyInput}
          onChange={setProxyInput}
          placeholder="http://127.0.0.1:7890，留空用系统代理或直连"
        />
        {modalMsg && (
          <Alert style={{ marginTop: 12 }} type={modalMsg.type} content={modalMsg.text} />
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <Button long onClick={() => setModalOpen(false)}>关闭</Button>
          <Button type="primary" long loading={saving} onClick={saveSettings}>保存并验证</Button>
        </div>
      </Modal>
    </div>
  );
}
