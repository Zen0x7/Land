export const BandwidthDonutChart = {
  props: {
    readKilobytesPerSecond: {
      type: Number,
      required: true,
    },
    writeKilobytesPerSecond: {
      type: Number,
      required: true,
    },
  },
  computed: {
    totalKilobytesPerSecond() {
      return this.readKilobytesPerSecond + this.writeKilobytesPerSecond;
    },
    readPercentage() {
      if (this.totalKilobytesPerSecond === 0) {
        return 0;
      }

      return (this.readKilobytesPerSecond / this.totalKilobytesPerSecond) * 100;
    },
    writePercentage() {
      if (this.totalKilobytesPerSecond === 0) {
        return 0;
      }

      return (
        (this.writeKilobytesPerSecond / this.totalKilobytesPerSecond) * 100
      );
    },
    readStrokeDasharray() {
      const circumference = 2 * Math.PI * 52;
      return `${(this.readPercentage / 100) * circumference} ${circumference}`;
    },
    writeStrokeDasharray() {
      const circumference = 2 * Math.PI * 52;
      return `${(this.writePercentage / 100) * circumference} ${circumference}`;
    },
  },
  template: `
    <div class="donut-chart-wrapper">
      <svg viewBox="0 0 140 140" class="donut-chart">
        <circle cx="70" cy="70" r="52" class="donut-track"></circle>
        <circle
          cx="70"
          cy="70"
          r="52"
          class="donut-read"
          :stroke-dasharray="readStrokeDasharray"
          stroke-dashoffset="0"
        ></circle>
        <circle
          cx="70"
          cy="70"
          r="52"
          class="donut-write"
          :stroke-dasharray="writeStrokeDasharray"
          :stroke-dashoffset="-((readPercentage / 100) * 2 * Math.PI * 52)"
        ></circle>
      </svg>
      <div class="donut-chart-center-label">
        <strong>{{ totalKilobytesPerSecond.toFixed(3) }}</strong>
        <small>KB/s</small>
      </div>
    </div>
  `,
};
