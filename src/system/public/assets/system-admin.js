import {
  createApp,
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'https://unpkg.com/vue@3.5.22/dist/vue.esm-browser.prod.js';
import { io } from 'https://cdn.socket.io/4.8.3/socket.io.esm.min.js';

const socketClientPath = '/clients';
const systemTopologyUpdatedEvent = 'SystemTopologyUpdated';

createApp({
  setup() {
    const topology = ref(null);
    const selectedNodeIdentifier = ref(null);
    const showAllConnections = ref(false);
    const statusMessage = ref('Loading topology...');
    const socket = ref(null);

    const nodes = computed(() => {
      return topology.value?.nodes ?? [];
    });

    const allConnections = computed(() => {
      return topology.value?.connections ?? [];
    });

    const selectedNode = computed(() => {
      if (!selectedNodeIdentifier.value) {
        return null;
      }

      return (
        nodes.value.find((node) => node.id === selectedNodeIdentifier.value) ??
        null
      );
    });

    const displayedConnections = computed(() => {
      if (showAllConnections.value) {
        return allConnections.value;
      }

      if (!selectedNode.value) {
        return [];
      }

      return [
        ...selectedNode.value.incomingConnections,
        ...selectedNode.value.outgoingConnections,
      ];
    });

    const loadTopology = async () => {
      const response = await fetch('/system/api/topology');
      topology.value = await response.json();

      if (!selectedNodeIdentifier.value && nodes.value.length > 0) {
        selectedNodeIdentifier.value = nodes.value[0].id;
      }

      statusMessage.value = `Updated: ${new Date(topology.value.generatedAt).toLocaleTimeString()}`;
    };

    const connectSocket = () => {
      socket.value = io({
        path: socketClientPath,
        transports: ['websocket'],
      });

      socket.value.on(systemTopologyUpdatedEvent, (snapshot) => {
        topology.value = snapshot;

        if (!selectedNodeIdentifier.value && snapshot.nodes.length > 0) {
          selectedNodeIdentifier.value = snapshot.nodes[0].id;
        }

        statusMessage.value = `Live update: ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
      });
    };

    onMounted(async () => {
      await loadTopology();
      connectSocket();
    });

    onBeforeUnmount(() => {
      socket.value?.disconnect();
    });

    const selectNode = (nodeIdentifier) => {
      showAllConnections.value = false;
      selectedNodeIdentifier.value = nodeIdentifier;
    };

    const setAllConnections = () => {
      showAllConnections.value = true;
    };

    return {
      topology,
      nodes,
      allConnections,
      displayedConnections,
      selectedNode,
      selectedNodeIdentifier,
      showAllConnections,
      statusMessage,
      selectNode,
      setAllConnections,
    };
  },
  template: `
    <main class="system-layout">
      <header class="system-header">
        <h1>Land System Administration</h1>
        <p>Node Registry and Connection Topology</p>
        <small>{{ statusMessage }}</small>
      </header>

      <div class="system-grid">
        <section class="panel">
          <h2>Nodes</h2>
          <article
            v-for="node in nodes"
            :key="node.id"
            class="node-item"
            :class="{ active: selectedNodeIdentifier === node.id && !showAllConnections }"
            @click="selectNode(node.id)"
          >
            <strong>{{ node.name }}</strong>
            <div>{{ node.host }}:{{ node.port }}</div>
            <small>{{ node.id }}</small>
          </article>
        </section>

        <section class="panel">
          <div class="toolbar">
            <button
              :class="{ active: showAllConnections }"
              @click="setAllConnections"
            >
              All Connections ({{ allConnections.length }})
            </button>
            <button
              v-if="selectedNode"
              :class="{ active: !showAllConnections }"
              @click="selectNode(selectedNode.id)"
            >
              {{ selectedNode.name }} Connections
            </button>
          </div>

          <table class="connection-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Remote Node</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Average</th>
                <th>Samples</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="connection in displayedConnections" :key="connection.id">
                <td>{{ connection.direction }}</td>
                <td>
                  {{ connection.remoteNodeName }}<br />
                  <small>{{ connection.remoteHost }}:{{ connection.remotePort }}</small>
                </td>
                <td>
                  <span class="status-badge" :class="'status-' + connection.status">
                    {{ connection.status }}
                  </span>
                </td>
                <td>{{ connection.metrics.lastLatencyInMilliseconds ?? '-' }} ms</td>
                <td>{{ connection.metrics.averageLatencyInMilliseconds ?? '-' }} ms</td>
                <td>{{ connection.metrics.sampleCount }}</td>
              </tr>
              <tr v-if="displayedConnections.length === 0">
                <td colspan="6">No connections available for this view.</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  `,
}).mount('#system-administration-root');
