import { computed, ref, } from 'https://unpkg.com/vue@3.5.22/dist/vue.esm-browser.prod.js';
import { defineStore } from 'https://unpkg.com/pinia@3.0.4/dist/pinia.esm-browser.prod.js';
import { io } from 'https://cdn.socket.io/4.8.3/socket.io.esm.min.js';
const socketClientPath = '/clients';
const systemTopologyUpdatedEvent = 'SystemTopologyUpdated';
const getConnectionCombinedThroughput = (connection) => {
    return (connection.metrics.readKilobytesPerSecond +
        connection.metrics.writeKilobytesPerSecond);
};
export const useTopologyStore = defineStore('topology', () => {
    const topologySnapshot = ref(null);
    const selectedNodeIdentifier = ref(null);
    const selectedConnectionIdentifier = ref(null);
    const statusMessage = ref('Loading topology...');
    const socketClient = ref(null);
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
            return [];
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
        return (selectedNodeConnections.value.find((connection) => connection.id === selectedConnectionIdentifier.value) ?? null);
    });
    const networkMetrics = computed(() => {
        const allConnections = connections.value;
        const totalReadKilobytesPerSecond = allConnections.reduce((sum, connection) => sum + connection.metrics.readKilobytesPerSecond, 0);
        const totalWriteKilobytesPerSecond = allConnections.reduce((sum, connection) => sum + connection.metrics.writeKilobytesPerSecond, 0);
        const totalReadMegabytes = allConnections.reduce((sum, connection) => sum + connection.metrics.totalReadMegabytes, 0);
        const totalWrittenMegabytes = allConnections.reduce((sum, connection) => sum + connection.metrics.totalWrittenMegabytes, 0);
        const averageLatencyInMilliseconds = allConnections.length
            ? Math.round(allConnections.reduce((sum, connection) => {
                return sum + (connection.metrics.averageLatencyInMilliseconds ?? 0);
            }, 0) / allConnections.length)
            : null;
        return {
            totalReadKilobytesPerSecond,
            totalWriteKilobytesPerSecond,
            totalReadMegabytes,
            totalWrittenMegabytes,
            totalBandwidthKilobytesPerSecond: totalReadKilobytesPerSecond + totalWriteKilobytesPerSecond,
            averageLatencyInMilliseconds,
            connectionCount: allConnections.length,
        };
    });
    const nodeMetricsRows = computed(() => {
        return nodes.value.map((node) => {
            const nodeConnections = [
                ...node.incomingConnections,
                ...node.outgoingConnections,
            ];
            const totalBandwidthKilobytesPerSecond = nodeConnections.reduce((sum, connection) => sum + getConnectionCombinedThroughput(connection), 0);
            const totalTransferredMegabytes = nodeConnections.reduce((sum, connection) => sum +
                connection.metrics.totalReadMegabytes +
                connection.metrics.totalWrittenMegabytes, 0);
            return {
                ...node,
                totalBandwidthKilobytesPerSecond,
                totalTransferredMegabytes,
                totalConnections: nodeConnections.length,
            };
        });
    });
    const connectionsByNodeIdentifier = computed(() => {
        const groupedConnections = new Map();
        for (const node of nodes.value) {
            groupedConnections.set(node.id, [
                ...node.incomingConnections,
                ...node.outgoingConnections,
            ]);
        }
        return groupedConnections;
    });
    const applySnapshot = (snapshot, statusPrefix) => {
        topologySnapshot.value = snapshot;
        if (!selectedNodeIdentifier.value && snapshot.nodes.length > 0) {
            const localNode = snapshot.nodes.find((node) => node.isLocalNode);
            selectedNodeIdentifier.value = localNode?.id ?? snapshot.nodes[0].id;
        }
        if (selectedNodeIdentifier.value &&
            !nodeByIdentifier.value.has(selectedNodeIdentifier.value)) {
            selectedNodeIdentifier.value = snapshot.nodes[0]?.id ?? null;
        }
        if (selectedConnectionIdentifier.value) {
            const selectedConnections = connectionsByNodeIdentifier.value.get(selectedNodeIdentifier.value ?? '') ?? [];
            if (!selectedConnections.some((connection) => connection.id === selectedConnectionIdentifier.value)) {
                selectedConnectionIdentifier.value = null;
            }
        }
        statusMessage.value = `${statusPrefix}: ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
    };
    const loadTopology = async () => {
        const response = await fetch('/system/api/topology');
        const snapshot = (await response.json());
        applySnapshot(snapshot, 'Updated');
    };
    const connectLiveUpdates = () => {
        socketClient.value = io({
            path: socketClientPath,
            transports: ['websocket'],
        });
        socketClient.value.on(systemTopologyUpdatedEvent, (snapshot) => {
            applySnapshot(snapshot, 'Live update');
        });
    };
    const disconnectLiveUpdates = () => {
        socketClient.value?.disconnect();
        socketClient.value = null;
    };
    const selectNode = (nodeIdentifier) => {
        selectedNodeIdentifier.value = nodeIdentifier;
        selectedConnectionIdentifier.value = null;
    };
    const selectConnection = (connectionIdentifier) => {
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
