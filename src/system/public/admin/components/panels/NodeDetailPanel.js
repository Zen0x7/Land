import { ConnectionBarChart } from '../charts/ConnectionBarChart.js';
import {
  formatKilobytesPerSecond,
  formatMegabytes,
  formatMilliseconds,
  formatTimestamp,
} from '../../utilities/formatters.js';

export const NodeDetailPanel = {
  components: {
    ConnectionBarChart,
  },
  props: {
    selectedNode: {
      type: Object,
      default: null,
    },
    selectedNodeConnections: {
      type: Array,
      required: true,
    },
    selectedConnection: {
      type: Object,
      default: null,
    },
  },
  emits: ['select-connection'],
  computed: {
    selectedNodeMetrics() {
      const readKilobytesPerSecond = this.selectedNodeConnections.reduce(
        (sum, connection) => sum + connection.metrics.readKilobytesPerSecond,
        0
      );
      const writeKilobytesPerSecond = this.selectedNodeConnections.reduce(
        (sum, connection) => sum + connection.metrics.writeKilobytesPerSecond,
        0
      );

      return {
        readKilobytesPerSecond,
        writeKilobytesPerSecond,
        totalKilobytesPerSecond:
          readKilobytesPerSecond + writeKilobytesPerSecond,
      };
    },
  },
  methods: {
    formatKilobytesPerSecond,
    formatMegabytes,
    formatMilliseconds,
    formatTimestamp,
  },
  template: `
    <section class="surface node-detail-panel">
      <header class="surface-header" v-if="selectedNode">
        <h2>Node detail · {{ selectedNode.name }}</h2>
        <p>{{ selectedNode.host }}:{{ selectedNode.port }} · {{ selectedNode.id }}</p>
      </header>

      <div v-if="selectedNode" class="metric-grid">
        <article class="metric-card">
          <h3>Node Bandwidth</h3>
          <p>{{ formatKilobytesPerSecond(selectedNodeMetrics.totalKilobytesPerSecond) }}</p>
        </article>
        <article class="metric-card">
          <h3>Read Throughput</h3>
          <p>{{ formatKilobytesPerSecond(selectedNodeMetrics.readKilobytesPerSecond) }}</p>
        </article>
        <article class="metric-card">
          <h3>Write Throughput</h3>
          <p>{{ formatKilobytesPerSecond(selectedNodeMetrics.writeKilobytesPerSecond) }}</p>
        </article>
        <article class="metric-card">
          <h3>Connections</h3>
          <p>{{ selectedNodeConnections.length }}</p>
        </article>
      </div>

      <article class="surface-block" v-if="selectedNode">
        <h3>Bandwidth per connection</h3>
        <ConnectionBarChart :connections="selectedNodeConnections" />
      </article>

      <article class="surface-block" v-if="selectedNode">
        <h3>Connections table</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Direction</th>
              <th>Remote Node</th>
              <th>Status</th>
              <th>Last Latency</th>
              <th>Average Latency</th>
              <th>Read</th>
              <th>Write</th>
              <th>Total Read</th>
              <th>Total Write</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="connection in selectedNodeConnections"
              :key="connection.id"
              @click="$emit('select-connection', connection.id)"
              class="connection-row"
              :class="{ selected: selectedConnection?.id === connection.id }"
            >
              <td>{{ connection.direction }}</td>
              <td>
                <strong>{{ connection.remoteNodeName }}</strong>
                <small>{{ connection.remoteHost }}:{{ connection.remotePort }}</small>
              </td>
              <td><span class="status-pill" :class="'status-' + connection.status">{{ connection.status }}</span></td>
              <td>{{ formatMilliseconds(connection.metrics.lastLatencyInMilliseconds) }}</td>
              <td>{{ formatMilliseconds(connection.metrics.averageLatencyInMilliseconds) }}</td>
              <td>{{ formatKilobytesPerSecond(connection.metrics.readKilobytesPerSecond) }}</td>
              <td>{{ formatKilobytesPerSecond(connection.metrics.writeKilobytesPerSecond) }}</td>
              <td>{{ formatMegabytes(connection.metrics.totalReadMegabytes) }}</td>
              <td>{{ formatMegabytes(connection.metrics.totalWrittenMegabytes) }}</td>
            </tr>
            <tr v-if="selectedNodeConnections.length === 0">
              <td colspan="9">No connections found for this node.</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="surface-block connection-focus" v-if="selectedConnection">
        <h3>Connection focus · {{ selectedConnection.remoteNodeName }}</h3>
        <p>
          Last sample: {{ formatTimestamp(selectedConnection.metrics.lastMeasuredAt) }} ·
          Samples: {{ selectedConnection.metrics.sampleCount }}
        </p>
        <div class="connection-focus-grid">
          <div>
            <small>Current read</small>
            <strong>{{ formatKilobytesPerSecond(selectedConnection.metrics.readKilobytesPerSecond) }}</strong>
          </div>
          <div>
            <small>Current write</small>
            <strong>{{ formatKilobytesPerSecond(selectedConnection.metrics.writeKilobytesPerSecond) }}</strong>
          </div>
          <div>
            <small>Total read</small>
            <strong>{{ formatMegabytes(selectedConnection.metrics.totalReadMegabytes) }}</strong>
          </div>
          <div>
            <small>Total write</small>
            <strong>{{ formatMegabytes(selectedConnection.metrics.totalWrittenMegabytes) }}</strong>
          </div>
        </div>
      </article>
    </section>
  `,
};
