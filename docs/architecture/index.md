# Architecture

## App

`App` es la abstracción principal de ejecución de Land.

Se crea con `createApp()`:

```ts
import { createApp, type App } from 'land';

const app: App = createApp();

await app.run();
```

En este estado inicial, `App` contiene internamente:

- una instancia de **Express**;
- una instancia de **Socket.IO**.

Actualmente, Socket.IO se monta sobre el servidor HTTP usado por Express, por lo que ambas partes se ejecutan dentro del mismo proceso y puerto.

## Lifecycle

`run()` inicia el servidor y mantiene el proceso activo.

El proceso puede detenerse con señales del sistema como `SIGINT` (por ejemplo, `Ctrl + C`) o llamando `app.stop()`.
