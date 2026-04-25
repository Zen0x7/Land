# Architecture

## App

`App` is Land's main runtime abstraction.

It is created with `createApp()`:

```ts
import { createApp, type App } from 'land';

const app: App = createApp();

await app.run();
```

At this initial stage, `App` contains internally:

- one **Express** instance;
- one **Socket.IO** instance.

Currently, Socket.IO is mounted on the HTTP server used by Express, so both parts run in the same process and port.

## Lifecycle

`run()` starts the server and keeps the process running.

The process can be stopped with system signals such as `SIGINT` (for example, `Ctrl + C`) or by calling `app.stop()`.
