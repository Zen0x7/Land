import type { ClusterConnection } from '../../types/topologyTypes';

interface ChartRow extends ClusterConnection {
  combinedBandwidth: number;
  percentage: number;
}

export const ConnectionBarChart = {
  props: {
    connections: {
      type: Array,
      required: true,
    },
  },
  computed: {
    chartRows(): ChartRow[] {
      const connections = this.connections as ClusterConnection[];

      const maximumValue = connections.reduce((maximum, connection) => {
        const value =
          connection.metrics.readKilobytesPerSecond +
          connection.metrics.writeKilobytesPerSecond;

        return Math.max(maximum, value);
      }, 0);

      return connections.map((connection) => {
        const combinedBandwidth =
          connection.metrics.readKilobytesPerSecond +
          connection.metrics.writeKilobytesPerSecond;

        return {
          ...connection,
          combinedBandwidth,
          percentage:
            maximumValue > 0 ? (combinedBandwidth / maximumValue) * 100 : 0,
        };
      });
    },
  },
  template: `
    <div class="connection-bar-chart">
      <div
        v-for="connection in chartRows"
        :key="connection.id"
        class="connection-bar-row"
      >
        <div class="connection-bar-label">
          <strong>{{ connection.remoteNodeName }}</strong>
          <small>{{ connection.direction }}</small>
        </div>
        <div class="connection-bar-track">
          <div
            class="connection-bar-fill"
            :style="{ width: connection.percentage + '%' }"
          ></div>
        </div>
        <div class="connection-bar-value">
          {{ connection.combinedBandwidth.toFixed(3) }} KB/s
        </div>
      </div>
    </div>
  `,
};
