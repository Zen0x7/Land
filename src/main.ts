import { LandApp } from './app/LandApp';
import type { App } from './app/appTypes';
import type {
  SeedConfiguration,
  AppConfiguration,
} from './configuration/appConfiguration';
import type {
  NodeRegistrationMetadata,
  NodeRegistrationPayload,
  KnownNode,
} from './domain/node/nodeTypes';

export type {
  App,
  SeedConfiguration,
  AppConfiguration,
  NodeRegistrationMetadata,
  NodeRegistrationPayload,
  KnownNode,
};

export const createApp = (configuration: AppConfiguration): App => {
  return new LandApp(configuration);
};
