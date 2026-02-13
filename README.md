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
- 悬停时弹出 tooltip 展示开盘价、收盘价和涨跌幅（两位小数）
- 悬停 Total / Cycle 单元格时整行高亮，悬停中位数 / 平均数时整列高亮
- 年份背景从白色到蓝色渐变，直观呈现时间轴
- 支持中英文切换（右下角地球图标按钮）
- 右下角 X (Twitter) 和 GitHub 跳转按钮
- 自适应缩放，桌面端和移动端均可完整展示（等比缩小，布局一致）

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
- **实时数据**：Binance WebSocket（逐笔交易 + 月线 K 线）
- **历史数据**：`data/monthly-seed.json` 静态文件（数据源：blockchain.info）
- **减半预测**：Blockchair 公开 API
- **自动更新**：GitHub Actions 每月自动固化上月数据（含自动重试机制）

## 数据说明

| 项目 | 说明 |
|------|------|
| 时区 | UTC |
| 计价 | USDT |
| 月涨跌幅 | (收盘价 - 开盘价) / 开盘价 × 100% |
| 历史数据 | 2010-08 起，来自 `monthly-seed.json`（blockchain.info） |
| 实时数据 | 当前月通过 Binance WebSocket 动态更新 |

## 每月自动更新

通过 GitHub Actions，每月 1 日 UTC 00:10 自动从 blockchain.info 获取上月收盘数据，写入 `monthly-seed.json` 并提交。

如果获取失败（API 暂时不可用或数据尚未就绪），脚本会自动重试，每次间隔 1 小时，最多重试 5 次。

- 工作流：`.github/workflows/monthly-update.yml`
- 脚本：`scripts/update-monthly-seed.mjs`

也可手动触发：进入仓库 Actions 页面 → Monthly Seed Update → Run workflow。

## 项目结构

```
├── index.html                 # 页面入口
├── app.js                     # 主逻辑（数据加载、实时更新、交互）
├── styles.css                 # 样式（含移动端自适应）
├── src/
│   ├── config.js              # 全局配置
│   ├── dataService.js         # 数据获取（REST + WebSocket）
│   ├── metrics.js             # 数据计算（矩阵、统计）
│   ├── render.js              # 渲染（表格、滚动数字、按钮）
│   └── i18n.js                # 中英文翻译
├── data/
│   └── monthly-seed.json      # 历史月度数据
├── favicon/                   # 网站图标（ico / png / webmanifest）
├── fonts/
│   └── reeji-flash.ttf        # 自定义字体
├── scripts/
│   └── update-monthly-seed.mjs # 月度数据更新脚本（含重试机制）
└── .github/workflows/
    └── monthly-update.yml     # GitHub Actions 工作流
```

## License

MIT
