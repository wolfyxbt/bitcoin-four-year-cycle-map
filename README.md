# 比特币四年周期轮回图 | Bitcoin Four-Year Cycle Map

一张表看懂比特币的四年周期规律。

以月度涨跌幅矩阵的形式，展示 2011 年至今每个月的价格变化，并标注减半年、大牛年、回调年、小牛年的周期轮替。数据实时更新，打开即用。

## 预览

- 年份 × 月份矩阵，涨跌幅按 9 级渐变色（绿涨红跌）直观呈现
- 实时比特币价格 + 本月涨跌幅（滚动数字效果）
- 减半月份黄色高亮（含下次减半动态预测）
- 每四年一组行间距，清晰划分周期
- 鼠标悬停单元格浮动放大，联动高亮年份和月份表头
- 支持中英文切换

## 在线访问

部署到任意静态托管平台（GitHub Pages、Vercel、Netlify 等）即可直接使用，无需后端。

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
- **历史数据**：`data/monthly-seed.json` 静态文件
- **减半预测**：Blockchair 公开 API
- **自动更新**：GitHub Actions 每月自动固化上月数据

## 数据说明

| 项目 | 说明 |
|------|------|
| 时区 | UTC |
| 计价 | USDT |
| 月涨跌幅 | (收盘价 - 开盘价) / 开盘价 × 100% |
| 历史数据 | 2011-01 起，来自 `monthly-seed.json` |
| 实时数据 | 当前月通过 Binance WebSocket 动态更新 |

## 每月自动更新

通过 GitHub Actions，每月 1 日 UTC 00:10 自动执行脚本，将上个月的收盘数据写入 `monthly-seed.json` 并提交。

- 工作流：`.github/workflows/monthly-update.yml`
- 脚本：`scripts/update-monthly-seed.mjs`

也可手动触发：进入仓库 Actions 页面 → Monthly Seed Update → Run workflow。

## 项目结构

```
├── index.html                 # 页面入口
├── app.js                     # 主逻辑（数据加载、实时更新、交互）
├── styles.css                 # 样式
├── src/
│   ├── config.js              # 全局配置
│   ├── dataService.js         # 数据获取（REST + WebSocket）
│   ├── metrics.js             # 数据计算（矩阵、统计）
│   ├── render.js              # 渲染（表格、滚动数字）
│   └── i18n.js                # 中英文翻译
├── data/
│   └── monthly-seed.json      # 历史月度数据
├── fonts/
│   └── reeji-flash.ttf        # 自定义字体
├── scripts/
│   └── update-monthly-seed.mjs # 月度数据更新脚本
└── .github/workflows/
    └── monthly-update.yml     # GitHub Actions 工作流
```

## License

MIT
