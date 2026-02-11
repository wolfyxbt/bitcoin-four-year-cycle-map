export const CONFIG = {
  timezoneOffsetMs: 0,
  startYear: 2011,
  endYear: 2030,
  monthlySeedPath: "./data/monthly-seed.json",
  monthLabels: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  cycleAnchorYear: 2024,
  halvingMonths: new Set(["2012-11", "2016-06", "2020-05", "2024-04", "2028-04"]),
};

export const CYCLE_INFO = {
  0: { key: "halving", className: "cycle-halving" },
  1: { key: "bigBull", className: "cycle-big-bull" },
  2: { key: "correction", className: "cycle-correction" },
  3: { key: "smallBull", className: "cycle-small-bull" },
};
