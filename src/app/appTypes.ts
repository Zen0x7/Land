import type { KnownNode } from '../domain/node/nodeTypes';

export interface App {
  run(): Promise<void>;
  stop(): Promise<void>;
  getKnownNodes(): KnownNode[];
}
