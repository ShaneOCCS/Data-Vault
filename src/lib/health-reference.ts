// Averages from the MOCK heart dataset (heart_health_data.xlsx, 160 people),
// used for the "compared with others" chart on the member dashboard.
// Only group averages are kept here, never anyone's individual row.
// Replace with real reference values when the client provides them.

export type GroupAverage = { n: number; bmi: number; weight: number; height: number };

export const HEART_REFERENCE: {
  all: GroupAverage;
  bySex: Record<string, GroupAverage>;
  byAge: Record<string, GroupAverage>;
} = {
  "all": {
    "n": 160,
    "bmi": 27.5,
    "weight": 77.6,
    "height": 1.68
  },
  "bySex": {
    "Female": {
      "n": 86,
      "bmi": 27.4,
      "weight": 71.7,
      "height": 1.62
    },
    "Male": {
      "n": 74,
      "bmi": 27.5,
      "weight": 84.4,
      "height": 1.75
    }
  },
  "byAge": {
    "Age 18 to 24": {
      "n": 10,
      "bmi": 27.3,
      "weight": 72.0,
      "height": 1.62
    },
    "Age 25 to 29": {
      "n": 7,
      "bmi": 25.6,
      "weight": 73.8,
      "height": 1.69
    },
    "Age 30 to 34": {
      "n": 6,
      "bmi": 29.4,
      "weight": 80.1,
      "height": 1.65
    },
    "Age 35 to 39": {
      "n": 12,
      "bmi": 28.2,
      "weight": 79.3,
      "height": 1.68
    },
    "Age 40 to 44": {
      "n": 14,
      "bmi": 28.3,
      "weight": 80.6,
      "height": 1.69
    },
    "Age 45 to 49": {
      "n": 14,
      "bmi": 26.8,
      "weight": 74.5,
      "height": 1.67
    },
    "Age 50 to 54": {
      "n": 8,
      "bmi": 28.4,
      "weight": 76.3,
      "height": 1.64
    },
    "Age 55 to 59": {
      "n": 20,
      "bmi": 28.2,
      "weight": 82.6,
      "height": 1.71
    },
    "Age 60 to 64": {
      "n": 12,
      "bmi": 27.3,
      "weight": 74.2,
      "height": 1.65
    },
    "Age 65 to 69": {
      "n": 10,
      "bmi": 28.1,
      "weight": 77.9,
      "height": 1.67
    },
    "Age 70 to 74": {
      "n": 19,
      "bmi": 25.0,
      "weight": 71.8,
      "height": 1.7
    },
    "Age 75 to 79": {
      "n": 13,
      "bmi": 28.0,
      "weight": 83.7,
      "height": 1.72
    },
    "Age 80 or older": {
      "n": 15,
      "bmi": 27.8,
      "weight": 79.0,
      "height": 1.69
    }
  }
};
