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
- `src/domain/connection`: topology connection and metrics types.
- `src/store`: Pinia stores using the Composition API (`defineStore(id, () => {})`).
- `src/events` and `src/shared`: event constants and shared utilities.
- `src/system/public`: static Vue administration panel assets served from `/system`.

This keeps node clustering behavior maintainable as new domains are introduced.

## Runtime components

Every `App` instance creates:

- one **Express** server;
- one **Socket.IO node server** (`path: /nodes`);
- one **Socket.IO client server** (`path: /clients`) for admin dashboards;
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

## Sidecar metrics

Every connection record tracks:

- direction (`incoming` or `outgoing`);
- status (`connecting`, `connected`, `disconnected`);
- last measured latency;
- average latency and sample count.

Latency is measured using a dedicated `LatencyPing` event and acknowledgements over node sockets, for both incoming and outgoing connection records.

## System administration surfaces

The app exposes:

- `GET /system/api/topology`: complete snapshot for initial loading.
- `GET /system/api/nodes`: hierarchical node-centric view.
- `GET /system/api/connections`: flat connection registry.
- `GET /system`: static Vue administration panel.

Live updates are broadcast as `SystemTopologyUpdated` on Socket.IO `path: /clients`.

## Lifecycle

- `run()` starts the HTTP server, both Socket.IO paths, and optional seed bootstrap.
- `stop()` closes clients, listeners, timers, and HTTP resources.
- `getKnownNodes()` returns current node entries from Pinia.
- `getConnections()` returns registered connection records.
- `getTopologySnapshot()` returns the same topology payload used by `/system/api/topology`.
