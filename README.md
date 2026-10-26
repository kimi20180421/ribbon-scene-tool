# 织带场景图一键生成工具

上传织带（缎带/罗纹带/铁丝边带等）产品图，选择风格，一键批量生成"用这条织带包装好的商品"场景效果图，用于电商详情页、主图、社媒素材。每张图支持单独「换一换」。

支持 **Google Gemini（Nano Banana 系列）** 与 **OpenAI GPT Image** 双供应商，支持多人使用——**每人填写自己的 API Key，只保存在各自的浏览器里**。

## 功能

- 8 种风格模板：高级撞色礼盒 / 黑白轻奢礼盒堆 / 节日烘焙包装 / 新中式礼盒 / 圣诞礼盒包装 / 柔调纸品组合 / 产品包覆展示 / 蝴蝶结特写
- 每种风格的提示词内置"花纹与织字必须与参考图一致、不得镜像、不得拼写错误"的强约束
- 出图质量三档（low / medium / high）与画面比例可选，界面实时显示成本估算
- 单张「换一换」：带不同变化指令重新生成，构图/道具/光线有变化、风格不变
- 自动读取 macOS 系统代理，也可手动配置代理；内置网络连通性检测
- 生成结果自动保存到 `output/` 目录

## 快速开始

```bash
git clone https://github.com/kimi20180421/ribbon-scene-tool.git
cd ribbon-scene-tool
npm install
npm start
```

打开 <http://127.0.0.1:8787>，点右上角「API 设置」：

1. 选择供应商（Gemini / OpenAI）
2. 粘贴你自己的 API Key（Gemini 申请：<https://aistudio.google.com/apikey>；OpenAI 申请：<https://platform.openai.com/api-keys>）
3. 点「保存并验证」——Key 只保存在你自己的浏览器 localStorage，不会写入服务器

## 局域网共享（可选）

让同事用他们的电脑访问：

```ini
# .env 中添加
HOST=0.0.0.0
```

重启后控制台会打印局域网地址（如 `http://192.168.x.x:8787`）。内网为 HTTP 明文传输，如需更严格管控请自行加反向代理 + HTTPS。

## 配置文件（.env，可选）

页面设置已覆盖绝大多数场景，也可手动编辑 `.env`（参考 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `PROVIDER` | `gemini` / `openai`，留空自动判断 |
| `GEMINI_API_KEY` | 服务器级共用 Key（可选，个人 Key 优先） |
| `GEMINI_IMAGE_MODEL` | 默认 `gemini-2.5-flash-image`；织字用 `gemini-3-pro-image-preview` |
| `OPENAI_API_KEY` | 服务器级共用 Key（可选） |
| `OPENAI_IMAGE_MODEL` | 默认 `gpt-image-2` |
| `PROXY_URL` | 代理地址，留空时 macOS 自动读取系统代理 |
| `HOST` / `PORT` | 监听地址与端口 |

## 模型与成本（人民币/张，估算）

| 模型 | 单价 | 特点 |
|---|---|---|
| gemini-2.5-flash-image | ≈ ¥0.28 | 快、便宜，日常批量 |
| gemini-3.1-flash-image | ≈ ¥0.48 | 均衡 |
| gemini-3-pro-image-preview | ≈ ¥0.96 | 织字/文字渲染最强，支持 2K |
| gpt-image-2 (medium/high) | ≈ ¥0.38 / ¥1.52 | 构图与排版强 |

## 注意事项

- Gemini 输出带 SynthID 隐形水印（不可关闭）；OpenAI 输出带 C2PA 元数据
- AI 生成图片用于电商平台商品页时，请遵守平台与当地法规的 AI 内容标识要求
- 请勿将 `.env`（含 Key）提交到仓库，`.gitignore` 已排除
