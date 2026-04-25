export interface ConnectionMetrics {
  lastLatencyInMilliseconds: number | null;
  averageLatencyInMilliseconds: number | null;
  sampleCount: number;
  lastMeasuredAt: string | null;
  totalReadMegabytes: number;
  totalWrittenMegabytes: number;
  readKilobytesPerSecond: number;
  writeKilobytesPerSecond: number;
}

export interface ClusterConnection {
  id: string;
  remoteNodeName: string;
  remoteHost: string;
  remotePort: number;
  direction: 'incoming' | 'outgoing';
  status: 'connecting' | 'connected' | 'disconnected';
  metrics: ConnectionMetrics;
}

export interface NodeSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  isLocalNode: boolean;
  incomingConnections: ClusterConnection[];
  outgoingConnections: ClusterConnection[];
}

export interface TopologySnapshot {
  generatedAt: string;
  nodes: NodeSummary[];
  connections: ClusterConnection[];
}
