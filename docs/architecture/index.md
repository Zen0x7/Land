# Architecture

## App

`App` is Land's main runtime abstraction.

It is created with `createApp(configuration)`:

```ts
import { createApp, type App, type AppConfiguration } from 'land';

const configuration: AppConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'node-a',
  host: '127.0.0.1',
  port: 3000,
  maximumAcceptedConnections: 10,
};

const app: App = createApp(configuration);
await app.run();
```

## Source layout

The runtime is organized by domain and responsibility:

- `src/app`: application runtime contracts and `LandApp` implementation.
- `src/configuration`: app-level configuration schemas.
- `src/domain/node`: node registration and discovery domain types.
- `src/store`: Pinia stores using the Composition API (`defineStore(id, () => {})`).
- `src/events` and `src/shared`: event constants and shared utilities.

This keeps node clustering behavior maintainable as new domains are introduced.

## Runtime components

Every `App` instance creates:

- one **Express** server;
- one **Socket.IO server** (node-facing endpoint);
- one **Pinia store** used to persist known node registrations;
- zero or more **Socket.IO clients** for outbound peer connections.

## Registration flow

When a node client connects, it must emit `Registration` with:

- `id` (UUID v4);
- `name`;
- `host`;
- `port`;
- `metadata.maximumAcceptedConnections`.

The receiver stores that node in Pinia and then opens additional outbound sockets toward the registered node.

## Discovery flow

After processing registration, the receiver emits `Discovery` with the list of known nodes.

The joining node processes that list and attempts to connect to missing peers, creating a progressively connected topology.

## Heartbeat

Connection liveness uses native Socket.IO heartbeat (`pingInterval` and `pingTimeout`) for both server and client sockets.

## Lifecycle

- `run()` starts the HTTP + Socket.IO server and optional seed client bootstrap.
- `stop()` closes clients, server listeners, and HTTP resources.
- `getKnownNodes()` returns current node entries from the Pinia store.
