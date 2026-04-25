export interface SeedConfiguration {
  host: string;
  port: number;
}

export interface AppConfiguration {
  id: string;
  name: string;
  host: string;
  port: number;
  maximumAcceptedConnections: number;
  seed?: SeedConfiguration;
}
