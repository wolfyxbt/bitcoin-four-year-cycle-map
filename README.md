# 比特币四年周期轮动图 | Bitcoin Four-Year Cycle Map

一张表看懂比特币的四年周期规律。

以月度涨跌幅矩阵的形式，展示 2011 年至今每个月的价格变化，并标注减半年、大牛年、回调年、小牛年的周期轮替。数据实时更新，打开即用。

## 在线访问

**https://wolfyxbt.github.io/bitcoin-four-year-cycle-map/**

纯静态页面，无需后端，也可部署到 Vercel、Netlify 等平台。

## 功能特性

- 年份 × 月份矩阵，涨跌幅按 9 级渐变色（绿涨红跌）直观呈现
- 实时比特币价格 + 本月涨跌幅（滚动数字效果）
- 标题右侧显示实时价格与本月涨跌幅，上方标签、下方数值的上下布局
- 减半月份黄色高亮（含下次减半动态预测，基于 Blockchair API）
- 每四年一组行间距，清晰划分周期
- 鼠标悬停单元格浮动放大，联动高亮年份和月份表头
- 悬停时弹出 tooltip 展示开盘价、收盘价和涨跌幅（两位小数），桌面端与移动端均正确定位
- 悬停 Total / Cycle 单元格时整行高亮，悬停中位数 / 平均数时整列高亮（纯亮度高亮，无边框变化）
- 年份背景从白色到蓝色渐变，直观呈现时间轴
- 支持中英文切换（右下角地球图标按钮）
- 右下角 X (Twitter) 和 GitHub 跳转按钮
- 单屏自适应：使用 `transform: scale()` 等比缩放，桌面端和移动端打开即完整展示全部内容，无需滚动

## 本地运行

```bash
# 克隆仓库
git clone https://github.com/wolfyxbt/bitcoin-four-year-cycle-map.git
cd bitcoin-four-year-cycle-map

# 启动本地服务器（任选一种）
python3 -m http.server 8080
# 或
npx serve .
```

浏览器打开 `http://localhost:8080`

## 技术栈

- **纯前端**：HTML / CSS / JavaScript（ES Modules），无框架依赖
- **实时数据**：Binance 公开行情 REST + WebSocket（双域名自动切换，失败时读取每日静态快照）
- **历史数据**：`data/monthly-seed.json` 静态文件（Binance 官方归档 + 早期 Blockchain.com 数据）
- **减半预测**：Blockchair 公开 API
- **自动更新**：GitHub Actions 每月固化上月数据，并每日生成当前月静态快照

## 数据说明

| 项目 | 说明 |
|------|------|
| 时区 | UTC |
| 计价 | 2017-08 起为 USDT；更早历史为综合 USD 市价 |
| 月涨跌幅 | (收盘价 - 开盘价) / 开盘价 × 100% |
| 历史数据 | 2017-08 起来自 Binance `BTCUSDT` 官方月线归档；更早数据来自 Blockchain.com 未采样日线 |
| 实时数据 | 当前月优先使用 `data-api/data-stream.binance.vision`，失败后切换至 `binance.me`，全部不可用时使用每日静态快照 |

## 每月自动更新

通过 GitHub Actions 在每月 1–8 日 UTC 06:20 检查 Binance 官方月线归档，归档发布后把上月数据写入 `monthly-seed.json` 并提交。

Binance 通常在下月第一个星期一发布月度归档。归档尚未发布时任务会安全退出，下一天自动重试；下载完成后还会使用官方 `.CHECKSUM` 文件校验数据完整性。

另一个每日任务会从 Binance 官方日线归档生成 `data/current-month.json`。因此即使访客网络无法连接 Binance 实时域名，页面仍可展示截至前一日 UTC 收盘的静态快照。

- 工作流：`.github/workflows/monthly-update.yml`、`.github/workflows/daily-snapshot.yml`
- 脚本：`scripts/update-monthly-seed.mjs`

也可手动触发：进入仓库 Actions 页面 → Monthly Seed Update → Run workflow。

## 项目结构

```
├── index.html                 # 页面入口
├── app.js                     # 主逻辑（数据加载、实时更新、交互）
├── styles.css                 # 样式（单屏自适应，transform 缩放）
├── src/
│   ├── config.js              # 全局配置
│   ├── dataService.js         # 数据获取（REST + WebSocket）
│   ├── metrics.js             # 数据计算（矩阵、统计）
│   ├── render.js              # 渲染（表格、滚动数字、按钮）
│   └── i18n.js                # 中英文翻译
├── data/
│   ├── monthly-seed.json      # 历史月度数据
│   └── current-month.json     # 当前月每日静态快照
├── favicon/                   # 网站图标（ico / png / webmanifest）
├── fonts/
│   └── reeji-flash.ttf        # 自定义字体
├── scripts/
│   └── update-monthly-seed.mjs # 月度数据与每日快照更新脚本
└── .github/workflows/
    ├── daily-snapshot.yml     # 每日静态快照
    └── monthly-update.yml     # 月度数据更新
```

## License

MIT
