export interface NodeRegistrationMetadata {
  maximumAcceptedConnections: number;
}

export interface NodeRegistrationPayload {
  id: string;
  name: string;
  host: string;
  port: number;
  metadata: NodeRegistrationMetadata;
}

export interface KnownNode {
  id: string;
  name: string;
  host: string;
  port: number;
  metadata: NodeRegistrationMetadata;
}
