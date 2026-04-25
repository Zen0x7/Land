# Land

Land is a Node.js framework runtime focused on building distributed node topologies over Express + Socket.IO.

## Installation

```bash
yarn add land
```

## Quick start

```ts
import { createApp, type AppConfiguration } from 'land';

const configuration: AppConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'node-a',
  host: '0.0.0.0',
  port: 3000,
  maximumAcceptedConnections: 10,
};

const app = createApp(configuration);

await app.run();
```

## Seeded mesh behavior

A node can join an existing network by setting `seed` in `AppConfiguration`.

When connected, every node:

1. sends `Registration` with its node identity and metadata;
2. receives `Discovery` with known peers from the remote node;
3. opens additional Socket.IO connections according to `maximumAcceptedConnections`.

Socket.IO heartbeat (`pingInterval` and `pingTimeout`) is used to keep connections active.

## System administration panel

Every node serves a static Vue-based administration panel at `/system`.

- `/system/api/topology`: global nodes + connections snapshot.
- `/system/api/nodes`: hierarchical nodes with inbound/outbound connections.
- `/system/api/connections`: flat connection list.
- Socket.IO node traffic uses `path: /nodes`.
- Live panel updates use a dedicated Socket.IO server on `path: /clients`.

Each connection tracks sidecar metrics: status, last latency, average latency, and sample count.

`yarn build` also copies `/system` static assets into `dist/system/public` so the dashboard works from compiled output.

## Run a local three-node cluster demo

To quickly test node discovery and the `/system` dashboard on different ports, run:

```bash
yarn cluster:three
```

This script starts three nodes on `127.0.0.1` ports `4100`, `4101`, and `4102`, with seeded chaining so they discover each other.

## Documentation

- [Get Started](./docs/get-started/index.md)
- [Architecture](./docs/architecture/index.md)
