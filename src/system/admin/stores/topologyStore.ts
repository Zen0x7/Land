import { computed, ref } from 'vue/dist/vue.esm-bundler.js';
import { defineStore } from 'pinia';
import { io } from 'socket.io-client';
import type {
  ClusterConnection,
  NodeSummary,
  TopologySnapshot,
} from '../types/topologyTypes';

const socketClientPath = '/clients';
const systemTopologyUpdatedEvent = 'SystemTopologyUpdated';

const getConnectionCombinedThroughput = (
  connection: ClusterConnection
): number => {
  return (
    connection.metrics.readKilobytesPerSecond +
    connection.metrics.writeKilobytesPerSecond
  );
};

interface NodeMetricsRow extends NodeSummary {
  totalBandwidthKilobytesPerSecond: number;
  totalTransferredMegabytes: number;
  totalConnections: number;
}

export const useTopologyStore = defineStore('topology', () => {
  const topologySnapshot = ref<TopologySnapshot | null>(null);
  const selectedNodeIdentifier = ref<string | null>(null);
  const selectedConnectionIdentifier = ref<string | null>(null);
  const statusMessage = ref('Loading topology...');
  const socketClient = ref<ReturnType<typeof io> | null>(null);

  const nodes = computed(() => topologySnapshot.value?.nodes ?? []);
  const connections = computed(() => topologySnapshot.value?.connections ?? []);

  const nodeByIdentifier = computed(() => {
    return new Map(nodes.value.map((node) => [node.id, node]));
  });

  const selectedNode = computed(() => {
    if (!selectedNodeIdentifier.value) {
      return null;
    }

    return nodeByIdentifier.value.get(selectedNodeIdentifier.value) ?? null;
  });

  const selectedNodeConnections = computed(() => {
    if (!selectedNode.value) {
      return [] as ClusterConnection[];
    }

    return [
      ...selectedNode.value.incomingConnections,
      ...selectedNode.value.outgoingConnections,
    ];
  });

  const selectedConnection = computed(() => {
    if (!selectedConnectionIdentifier.value) {
      return null;
    }

    return (
      selectedNodeConnections.value.find(
        (connection) => connection.id === selectedConnectionIdentifier.value
      ) ?? null
    );
  });

  const networkMetrics = computed(() => {
    const allConnections = connections.value;

    const totalReadKilobytesPerSecond = allConnections.reduce(
      (sum, connection) => sum + connection.metrics.readKilobytesPerSecond,
      0
    );

    const totalWriteKilobytesPerSecond = allConnections.reduce(
      (sum, connection) => sum + connection.metrics.writeKilobytesPerSecond,
      0
    );

    const totalReadMegabytes = allConnections.reduce(
      (sum, connection) => sum + connection.metrics.totalReadMegabytes,
      0
    );

    const totalWrittenMegabytes = allConnections.reduce(
      (sum, connection) => sum + connection.metrics.totalWrittenMegabytes,
      0
    );

    const averageLatencyInMilliseconds = allConnections.length
      ? Math.round(
          allConnections.reduce((sum, connection) => {
            return sum + (connection.metrics.averageLatencyInMilliseconds ?? 0);
          }, 0) / allConnections.length
        )
      : null;

    return {
      totalReadKilobytesPerSecond,
      totalWriteKilobytesPerSecond,
      totalReadMegabytes,
      totalWrittenMegabytes,
      totalBandwidthKilobytesPerSecond:
        totalReadKilobytesPerSecond + totalWriteKilobytesPerSecond,
      averageLatencyInMilliseconds,
      connectionCount: allConnections.length,
    };
  });

  const nodeMetricsRows = computed<NodeMetricsRow[]>(() => {
    return nodes.value.map((node) => {
      const nodeConnections = [
        ...node.incomingConnections,
        ...node.outgoingConnections,
      ];

      const totalBandwidthKilobytesPerSecond = nodeConnections.reduce(
        (sum, connection) => sum + getConnectionCombinedThroughput(connection),
        0
      );

      const totalTransferredMegabytes = nodeConnections.reduce(
        (sum, connection) =>
          sum +
          connection.metrics.totalReadMegabytes +
          connection.metrics.totalWrittenMegabytes,
        0
      );

      return {
        ...node,
        totalBandwidthKilobytesPerSecond,
        totalTransferredMegabytes,
        totalConnections: nodeConnections.length,
      };
    });
  });

  const connectionsByNodeIdentifier = computed(() => {
    const groupedConnections = new Map<string, ClusterConnection[]>();

    for (const node of nodes.value) {
      groupedConnections.set(node.id, [
        ...node.incomingConnections,
        ...node.outgoingConnections,
      ]);
    }

    return groupedConnections;
  });

  const applySnapshot = (
    snapshot: TopologySnapshot,
    statusPrefix: string
  ): void => {
    topologySnapshot.value = snapshot;

    if (!selectedNodeIdentifier.value && snapshot.nodes.length > 0) {
      const localNode = snapshot.nodes.find((node) => node.isLocalNode);
      selectedNodeIdentifier.value = localNode?.id ?? snapshot.nodes[0].id;
    }

    if (
      selectedNodeIdentifier.value &&
      !nodeByIdentifier.value.has(selectedNodeIdentifier.value)
    ) {
      selectedNodeIdentifier.value = snapshot.nodes[0]?.id ?? null;
    }

    if (selectedConnectionIdentifier.value) {
      const selectedConnections =
        connectionsByNodeIdentifier.value.get(
          selectedNodeIdentifier.value ?? ''
        ) ?? [];

      if (
        !selectedConnections.some(
          (connection) => connection.id === selectedConnectionIdentifier.value
        )
      ) {
        selectedConnectionIdentifier.value = null;
      }
    }

    statusMessage.value = `${statusPrefix}: ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
  };

  const loadTopology = async (): Promise<void> => {
    const response = await fetch('/system/api/topology');
    const snapshot = (await response.json()) as TopologySnapshot;
    applySnapshot(snapshot, 'Updated');
  };

  const connectLiveUpdates = (): void => {
    socketClient.value = io({
      path: socketClientPath,
      transports: ['websocket'],
    });

    socketClient.value.on(systemTopologyUpdatedEvent, (snapshot) => {
      applySnapshot(snapshot as TopologySnapshot, 'Live update');
    });
  };

  const disconnectLiveUpdates = (): void => {
    socketClient.value?.disconnect();
    socketClient.value = null;
  };

  const selectNode = (nodeIdentifier: string): void => {
    selectedNodeIdentifier.value = nodeIdentifier;
    selectedConnectionIdentifier.value = null;
  };

  const selectConnection = (connectionIdentifier: string): void => {
    selectedConnectionIdentifier.value = connectionIdentifier;
  };

  return {
    topologySnapshot,
    statusMessage,
    nodes,
    connections,
    selectedNodeIdentifier,
    selectedNode,
    selectedNodeConnections,
    selectedConnection,
    networkMetrics,
    nodeMetricsRows,
    loadTopology,
    connectLiveUpdates,
    disconnectLiveUpdates,
    selectNode,
    selectConnection,
  };
});
