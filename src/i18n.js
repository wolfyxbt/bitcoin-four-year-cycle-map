const translations = {
  zh: {
    pageTitle: "比特币四年周期轮动图",
    mainTitle: "比特币",
    mainTitleSuffix: "四年周期轮动图",
    priceLabel: "比特币现价",
    yearHeader: "年份",
    monthLabels: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    total: "总计",
    cycle: "周期",
    median: "中位数",
    average: "平均数",
    halving: "减半年",
    bigBull: "大牛年",
    correction: "回调年",
    smallBull: "小牛年",
    monthChangeLabel: "本月",
    tooltipOpen: "开盘价",
    tooltipClose: "收盘价",
    tooltipChange: "涨跌幅",
    langBtn: "EN",
  },
  en: {
    pageTitle: "Bitcoin Four-Year Cycle Map",
    mainTitle: "Bitcoin",
    mainTitleSuffix: "Four-Year Cycle Map",
    priceLabel: "Bitcoin Price",
    yearHeader: "Year",
    monthLabels: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
    total: "Total",
    cycle: "Cycle",
    median: "Median",
    average: "Average",
    halving: "Halving Year",
    bigBull: "Big Bull Year",
    correction: "Correction Year",
    smallBull: "Small Bull Year",
    monthChangeLabel: "MTD",
    tooltipOpen: "Open",
    tooltipClose: "Close",
    tooltipChange: "Change",
    langBtn: "中",
  },
};

let currentLang = "zh";

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
}

export function t(key) {
  return translations[currentLang]?.[key] ?? translations.zh[key] ?? key;
}
