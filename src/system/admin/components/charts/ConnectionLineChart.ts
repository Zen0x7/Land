interface ConnectionBandwidthHistoryPoint {
  timestamp: string;
  bandwidthKilobytesPerSecond: number;
}

export const ConnectionLineChart = {
  props: {
    historyPoints: {
      type: Array,
      required: true,
    },
  },
  computed: {
    normalizedPoints(): Array<{
      x: number;
      y: number;
      bandwidthKilobytesPerSecond: number;
      timestamp: string;
    }> {
      const historyPoints = this
        .historyPoints as ConnectionBandwidthHistoryPoint[];
      const chartWidth = 360;
      const chartHeight = 120;
      const minimumX = 12;
      const maximumX = chartWidth - 12;
      const minimumY = 10;
      const maximumY = chartHeight - 14;

      if (historyPoints.length === 0) {
        return [];
      }

      const maximumBandwidth = historyPoints.reduce((maximum, point) => {
        return Math.max(maximum, point.bandwidthKilobytesPerSecond);
      }, 0);

      const safeMaximumBandwidth = Math.max(maximumBandwidth, 0.001);

      return historyPoints.map((point, index) => {
        const horizontalPosition =
          historyPoints.length > 1
            ? minimumX +
              (index / (historyPoints.length - 1)) * (maximumX - minimumX)
            : (minimumX + maximumX) / 2;

        const verticalRatio =
          point.bandwidthKilobytesPerSecond / safeMaximumBandwidth;
        const verticalPosition =
          maximumY - verticalRatio * (maximumY - minimumY);

        return {
          x: horizontalPosition,
          y: verticalPosition,
          bandwidthKilobytesPerSecond: point.bandwidthKilobytesPerSecond,
          timestamp: point.timestamp,
        };
      });
    },
    polylinePoints(): string {
      return this.normalizedPoints
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(' ');
    },
  },
  template: `
    <div class="connection-line-chart">
      <svg viewBox="0 0 360 120" class="connection-line-svg">
        <defs>
          <linearGradient id="connection-line-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(110, 179, 255, 0.45)" />
            <stop offset="100%" stop-color="rgba(110, 179, 255, 0.03)" />
          </linearGradient>
        </defs>

        <polyline
          v-if="polylinePoints"
          :points="polylinePoints"
          class="connection-line"
        ></polyline>

        <polyline
          v-if="polylinePoints"
          :points="polylinePoints + ' 348,106 12,106'"
          class="connection-line-area"
        ></polyline>

        <circle
          v-for="point in normalizedPoints"
          :key="point.timestamp"
          :cx="point.x"
          :cy="point.y"
          r="2.3"
          class="connection-line-point"
        >
          <title>
            {{ new Date(point.timestamp).toLocaleTimeString() }} · {{ point.bandwidthKilobytesPerSecond.toFixed(3) }} KB/s
          </title>
        </circle>
      </svg>
    </div>
  `,
};
