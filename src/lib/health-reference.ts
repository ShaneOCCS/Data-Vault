// Reference cohort averages for bloodwork panels, used for the
// "compared with others" chart on the member dashboard.
// Only group averages are kept here, never anyone's individual row.

export type GroupAverage = {
  n: number;
  ldl: number;
  hdl: number;
  triglycerides: number;
  glucose: number;
  hba1c: number;
};

export const HEART_REFERENCE: {
  all: GroupAverage;
  bySex: Record<string, GroupAverage>;
  byAge: Record<string, GroupAverage>;
} = {
  all: {
    n: 160,
    ldl: 112,
    hdl: 54,
    triglycerides: 138,
    glucose: 94,
    hba1c: 5.5,
  },
  bySex: {
    Female: {
      n: 86,
      ldl: 109,
      hdl: 59,
      triglycerides: 126,
      glucose: 91,
      hba1c: 5.4,
    },
    Male: {
      n: 74,
      ldl: 116,
      hdl: 49,
      triglycerides: 152,
      glucose: 97,
      hba1c: 5.6,
    },
  },
  byAge: {
    "Age 18 to 24": {
      n: 10,
      ldl: 96,
      hdl: 56,
      triglycerides: 108,
      glucose: 86,
      hba1c: 5.1,
    },
    "Age 25 to 29": {
      n: 7,
      ldl: 102,
      hdl: 55,
      triglycerides: 118,
      glucose: 89,
      hba1c: 5.2,
    },
    "Age 30 to 34": {
      n: 6,
      ldl: 108,
      hdl: 53,
      triglycerides: 129,
      glucose: 91,
      hba1c: 5.3,
    },
    "Age 35 to 39": {
      n: 12,
      ldl: 112,
      hdl: 53,
      triglycerides: 135,
      glucose: 93,
      hba1c: 5.4,
    },
    "Age 40 to 44": {
      n: 14,
      ldl: 115,
      hdl: 52,
      triglycerides: 141,
      glucose: 95,
      hba1c: 5.5,
    },
    "Age 45 to 49": {
      n: 14,
      ldl: 118,
      hdl: 53,
      triglycerides: 144,
      glucose: 96,
      hba1c: 5.5,
    },
    "Age 50 to 54": {
      n: 8,
      ldl: 121,
      hdl: 54,
      triglycerides: 148,
      glucose: 98,
      hba1c: 5.6,
    },
    "Age 55 to 59": {
      n: 20,
      ldl: 119,
      hdl: 55,
      triglycerides: 145,
      glucose: 99,
      hba1c: 5.7,
    },
    "Age 60 to 64": {
      n: 12,
      ldl: 116,
      hdl: 55,
      triglycerides: 142,
      glucose: 100,
      hba1c: 5.7,
    },
    "Age 65 to 69": {
      n: 10,
      ldl: 114,
      hdl: 56,
      triglycerides: 139,
      glucose: 101,
      hba1c: 5.8,
    },
    "Age 70 to 74": {
      n: 19,
      ldl: 110,
      hdl: 56,
      triglycerides: 134,
      glucose: 99,
      hba1c: 5.7,
    },
    "Age 75 to 79": {
      n: 13,
      ldl: 108,
      hdl: 55,
      triglycerides: 131,
      glucose: 98,
      hba1c: 5.7,
    },
    "Age 80 or older": {
      n: 15,
      ldl: 105,
      hdl: 54,
      triglycerides: 128,
      glucose: 97,
      hba1c: 5.6,
    },
  },
};
