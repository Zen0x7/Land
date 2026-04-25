import { BandwidthDonutChart } from '../charts/BandwidthDonutChart';
import { ConnectionLineChart } from '../charts/ConnectionLineChart';
import {
  formatKilobytesPerSecond,
  formatMegabytes,
  formatMilliseconds,
} from '../../utilities/formatters';

interface ConnectionBandwidthHistoryPoint {
  timestamp: string;
  bandwidthKilobytesPerSecond: number;
}

export const DashboardPanel = {
  components: {
    BandwidthDonutChart,
    ConnectionLineChart,
  },
  props: {
    networkMetrics: {
      type: Object,
      required: true,
    },
    nodeMetricsRows: {
      type: Array,
      required: true,
    },
    connections: {
      type: Array,
      required: true,
    },
    resolveConnectionBandwidthHistory: {
      type: Function,
      required: true,
    },
  },
  methods: {
    formatKilobytesPerSecond,
    formatMegabytes,
    formatMilliseconds,
    getConnectionHistory(
      connectionIdentifier: string
    ): ConnectionBandwidthHistoryPoint[] {
      const resolver = this.resolveConnectionBandwidthHistory as (
        connectionIdentifier: string
      ) => ConnectionBandwidthHistoryPoint[];
      return resolver(connectionIdentifier);
    },
  },
  template: `
    <section class="surface dashboard-panel">
      <header class="surface-header">
        <h2>Global dashboard</h2>
        <p>Total network bandwidth and transfer summaries.</p>
      </header>

      <div class="metric-grid">
        <article class="metric-card">
          <h3>Total Bandwidth</h3>
          <p>{{ formatKilobytesPerSecond(networkMetrics.totalBandwidthKilobytesPerSecond) }}</p>
        </article>
        <article class="metric-card">
          <h3>Read Throughput</h3>
          <p>{{ formatKilobytesPerSecond(networkMetrics.totalReadKilobytesPerSecond) }}</p>
        </article>
        <article class="metric-card">
          <h3>Write Throughput</h3>
          <p>{{ formatKilobytesPerSecond(networkMetrics.totalWriteKilobytesPerSecond) }}</p>
        </article>
        <article class="metric-card">
          <h3>Average Latency</h3>
          <p>{{ formatMilliseconds(networkMetrics.averageLatencyInMilliseconds) }}</p>
        </article>
      </div>

      <div class="dashboard-main-grid">
        <article class="surface-block">
          <h3>Read/Write distribution</h3>
          <BandwidthDonutChart
            :read-kilobytes-per-second="networkMetrics.totalReadKilobytesPerSecond"
            :write-kilobytes-per-second="networkMetrics.totalWriteKilobytesPerSecond"
          />
        </article>

        <article class="surface-block">
          <h3>All connection timelines</h3>
          <div class="connection-timeline-grid">
            <div
              v-for="connection in connections"
              :key="connection.id"
              class="connection-timeline-card"
            >
              <header>
                <strong>{{ connection.remoteNodeName }}</strong>
                <small>
                  {{ connection.remoteHost }}:{{ connection.remotePort }} · {{ connection.direction }}
                </small>
              </header>
              <ConnectionLineChart
                :history-points="getConnectionHistory(connection.id)"
              />
            </div>
          </div>
        </article>
      </div>

      <article class="surface-block">
        <h3>Nodes overview</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Node</th>
              <th>Total Connections</th>
              <th>Total Bandwidth</th>
              <th>Total Transferred</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="node in nodeMetricsRows" :key="node.id">
              <td>
                <strong>{{ node.name }}</strong>
                <small>{{ node.host }}:{{ node.port }}</small>
              </td>
              <td>{{ node.totalConnections }}</td>
              <td>{{ formatKilobytesPerSecond(node.totalBandwidthKilobytesPerSecond) }}</td>
              <td>{{ formatMegabytes(node.totalTransferredMegabytes) }}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </section>
  `,
};
