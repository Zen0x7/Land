export type ConnectionDirection = 'incoming' | 'outgoing';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface ConnectionMetrics {
  lastLatencyInMilliseconds: number | null;
  averageLatencyInMilliseconds: number | null;
  sampleCount: number;
  lastMeasuredAt: string | null;
  totalReadBytes: number;
  totalWrittenBytes: number;
  totalReadKilobytes: number;
  totalWrittenKilobytes: number;
  totalReadMegabytes: number;
  totalWrittenMegabytes: number;
  readBytesPerSecond: number;
  writeBytesPerSecond: number;
  readKilobytesPerSecond: number;
  writeKilobytesPerSecond: number;
  readMegabytesPerSecond: number;
  writeMegabytesPerSecond: number;
}

export interface ClusterConnection {
  id: string;
  socketIdentifier: string;
  localNodeIdentifier: string;
  remoteNodeIdentifier: string;
  remoteNodeName: string;
  remoteHost: string;
  remotePort: number;
  direction: ConnectionDirection;
  status: ConnectionStatus;
  connectedAt: string | null;
  updatedAt: string;
  metrics: ConnectionMetrics;
}

export interface NodeConnectionSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  isLocalNode: boolean;
  metadata: {
    maximumAcceptedConnections: number;
  };
  incomingConnections: ClusterConnection[];
  outgoingConnections: ClusterConnection[];
}

export interface TopologySnapshot {
  generatedAt: string;
  localNode: {
    id: string;
    name: string;
    host: string;
    port: number;
    maximumAcceptedConnections: number;
  };
  nodes: NodeConnectionSummary[];
  connections: ClusterConnection[];
}
