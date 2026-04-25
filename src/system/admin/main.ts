import { createApp, onBeforeUnmount, onMounted } from 'vue';
import { createPinia } from 'pinia';
import { useTopologyStore } from './stores/topologyStore';
import { DashboardPanel } from './components/panels/DashboardPanel';
import { NodeDetailPanel } from './components/panels/NodeDetailPanel';
import { formatNodeAddress } from './utilities/formatters';

const application = createApp({
  components: {
    DashboardPanel,
    NodeDetailPanel,
  },
  setup() {
    const topologyStore = useTopologyStore();

    onMounted(async () => {
      await topologyStore.loadTopology();
      topologyStore.connectLiveUpdates();
    });

    onBeforeUnmount(() => {
      topologyStore.disconnectLiveUpdates();
    });

    return {
      topologyStore,
      formatNodeAddress,
    };
  },
  template: `
    <main class="administration-layout">
      <header class="administration-header surface">
        <div>
          <h1>Land Control Center</h1>
          <p>Production-ready topology insights with precision metrics.</p>
        </div>
        <small>{{ topologyStore.statusMessage }}</small>
      </header>

      <div class="administration-shell">
        <aside class="surface sidebar">
          <h2>Nodes</h2>
          <p class="sidebar-caption">All known nodes, including the current node.</p>
          <button
            v-for="node in topologyStore.nodes"
            :key="node.id"
            class="node-button"
            :class="{ active: node.id === topologyStore.selectedNodeIdentifier }"
            @click="topologyStore.selectNode(node.id)"
          >
            <strong>
              {{ node.name }}
              <span v-if="node.isLocalNode" class="local-node-badge">local</span>
            </strong>
            <small>{{ formatNodeAddress(node) }}</small>
            <small>{{ node.id }}</small>
          </button>
        </aside>

        <section class="content-area">
          <DashboardPanel
            :network-metrics="topologyStore.networkMetrics"
            :node-metrics-rows="topologyStore.nodeMetricsRows"
            :connections="topologyStore.connections"
          />

          <NodeDetailPanel
            :selected-node="topologyStore.selectedNode"
            :selected-node-connections="topologyStore.selectedNodeConnections"
            :selected-connection="topologyStore.selectedConnection"
            @select-connection="topologyStore.selectConnection"
          />
        </section>
      </div>
    </main>
  `,
});

application.use(createPinia());
application.mount('#system-administration-root');
