# Get Started

## Create your first node

```ts
import { createApp, type AppConfiguration } from 'land';

const configuration: AppConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'node-a',
  host: '127.0.0.1',
  port: 3000,
  maximumAcceptedConnections: 5,
};

const app = createApp(configuration);
await app.run();
```

## Join an existing node as seed

```ts
const configuration: AppConfiguration = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'node-b',
  host: '127.0.0.1',
  port: 3001,
  maximumAcceptedConnections: 5,
  seed: {
    host: '127.0.0.1',
    port: 3000,
  },
};
```

`id` must be a UUID v4. After startup, the node will register itself on the seed and participate in discovery.

## Open the system administration panel

After running a node, open:

- `http://<host>:<port>/system`

The panel first fetches data from:

- `/system/api/topology`
- `/system/api/nodes`
- `/system/api/connections`

Then it subscribes to live topology updates through Socket.IO `path: /clients`.

## Run three nodes for a quick manual test

From the project root:

```bash
yarn cluster:three
```

This launches three connected nodes on:

- `http://127.0.0.1:4100/system`
- `http://127.0.0.1:4101/system`
- `http://127.0.0.1:4102/system`

Use these URLs in separate browser tabs to compare node and connection topology updates in real time.
