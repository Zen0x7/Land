import type {
  ClusterConnection,
  TopologySnapshot,
} from '../domain/connection/connectionTypes';
import type { KnownNode } from '../domain/node/nodeTypes';

export interface App {
  run(): Promise<void>;
  stop(): Promise<void>;
  getKnownNodes(): KnownNode[];
  getConnections(): ClusterConnection[];
  getTopologySnapshot(): TopologySnapshot;
}
