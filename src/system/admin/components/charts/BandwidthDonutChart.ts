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
  data() {
    return {
      animatedReadKilobytesPerSecond: 0,
      animatedWriteKilobytesPerSecond: 0,
      animationFrameIdentifier: 0,
    };
  },
  watch: {
    readKilobytesPerSecond: {
      immediate: true,
      handler() {
        this.animateToLatestMetrics();
      },
    },
    writeKilobytesPerSecond() {
      this.animateToLatestMetrics();
    },
  },
  computed: {
    totalKilobytesPerSecond(): number {
      return (
        this.animatedReadKilobytesPerSecond +
        this.animatedWriteKilobytesPerSecond
      );
    },
    readPercentage(): number {
      if (this.totalKilobytesPerSecond === 0) {
        return 0;
      }

      return (
        (this.animatedReadKilobytesPerSecond / this.totalKilobytesPerSecond) *
        100
      );
    },
    writePercentage(): number {
      if (this.totalKilobytesPerSecond === 0) {
        return 0;
      }

      return (
        (this.animatedWriteKilobytesPerSecond / this.totalKilobytesPerSecond) *
        100
      );
    },
    readStrokeDasharray(): string {
      const circumference = 2 * Math.PI * 52;
      return `${(this.readPercentage / 100) * circumference} ${circumference}`;
    },
    writeStrokeDasharray(): string {
      const circumference = 2 * Math.PI * 52;
      return `${(this.writePercentage / 100) * circumference} ${circumference}`;
    },
  },
  methods: {
    animateToLatestMetrics(): void {
      if (this.animationFrameIdentifier) {
        cancelAnimationFrame(this.animationFrameIdentifier);
      }

      const startReadValue = this.animatedReadKilobytesPerSecond;
      const startWriteValue = this.animatedWriteKilobytesPerSecond;
      const targetReadValue = this.readKilobytesPerSecond;
      const targetWriteValue = this.writeKilobytesPerSecond;
      const animationDurationInMilliseconds = 420;
      const animationStartTime = performance.now();

      const animate = (currentTime: number): void => {
        const elapsed = currentTime - animationStartTime;
        const progress = Math.min(elapsed / animationDurationInMilliseconds, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        this.animatedReadKilobytesPerSecond =
          startReadValue + (targetReadValue - startReadValue) * easedProgress;
        this.animatedWriteKilobytesPerSecond =
          startWriteValue +
          (targetWriteValue - startWriteValue) * easedProgress;

        if (progress < 1) {
          this.animationFrameIdentifier = requestAnimationFrame(animate);
          return;
        }

        this.animationFrameIdentifier = 0;
      };

      this.animationFrameIdentifier = requestAnimationFrame(animate);
    },
  },
  beforeUnmount() {
    if (this.animationFrameIdentifier) {
      cancelAnimationFrame(this.animationFrameIdentifier);
    }
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
