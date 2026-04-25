import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { createPinia, setActivePinia } from 'pinia';
import {
  io as createSocketIoClient,
  type Socket as SocketIoClientSocket,
} from 'socket.io-client';
import {
  Server as SocketIoServer,
  Socket as SocketIoServerSocket,
  type ServerOptions as SocketIoServerOptions,
} from 'socket.io';
import { REGISTRATION_EVENT, DISCOVERY_EVENT } from '../events/clusterEvents';
import type { App } from './appTypes';
import type { AppConfiguration } from '../configuration/appConfiguration';
import type {
  KnownNode,
  NodeRegistrationPayload,
} from '../domain/node/nodeTypes';
import { useKnownNodeStore } from '../store/knownNodeStore';
import { isValidUuidV4 } from '../shared/validation/isValidUuidV4';
import { createSocketAddress } from '../shared/network/createSocketAddress';

export class LandApp implements App {
  private readonly configuration: AppConfiguration;
  private readonly expressApplication: Express;
  private readonly httpServer: HttpServer;
  private readonly socketIoServer: SocketIoServer;
  private readonly knownNodeStore: ReturnType<typeof useKnownNodeStore>;
  private readonly outgoingSocketsByNodeIdentifier = new Map<
    string,
    Set<SocketIoClientSocket>
  >();
  private readonly registeredIncomingSocketIdentifiers = new Set<string>();
  private readonly eventUnsubscribeFunctions: Array<() => void> = [];
  private isRunning = false;
  private runResolver?: () => void;

  public constructor(configuration: AppConfiguration) {
    if (!isValidUuidV4(configuration.id)) {
      throw new Error('App configuration id must be a valid UUID v4.');
    }

    if (configuration.maximumAcceptedConnections < 1) {
      throw new Error('maximumAcceptedConnections must be greater than 0.');
    }

    setActivePinia(createPinia());

    this.configuration = configuration;
    this.expressApplication = express();
    this.httpServer = createServer(this.expressApplication);

    const socketServerOptions: Partial<SocketIoServerOptions> = {
      pingInterval: 25_000,
      pingTimeout: 20_000,
    };

    this.socketIoServer = new SocketIoServer(
      this.httpServer,
      socketServerOptions
    );
    this.knownNodeStore = useKnownNodeStore();

    this.registerSocketIoServerHandlers();
  }

  public run(): Promise<void> {
    if (this.isRunning) {
      return new Promise((resolve) => {
        if (this.runResolver) {
          const previousResolver = this.runResolver;
          this.runResolver = () => {
            previousResolver();
            resolve();
          };
        } else {
          resolve();
        }
      });
    }

    this.isRunning = true;

    const stopApplication = async () => {
      await this.stop();
    };

    process.once('SIGINT', stopApplication);
    process.once('SIGTERM', stopApplication);

    return new Promise((resolve, reject) => {
      this.runResolver = resolve;

      this.httpServer.once('error', (error) => {
        process.removeListener('SIGINT', stopApplication);
        process.removeListener('SIGTERM', stopApplication);
        this.isRunning = false;
        this.runResolver = undefined;
        reject(error);
      });

      this.httpServer.listen(
        this.configuration.port,
        this.configuration.host,
        () => {
          if (this.configuration.seed) {
            this.connectToKnownNode({
              id: `${this.configuration.seed.host}:${this.configuration.seed.port}`,
              name: 'seed',
              host: this.configuration.seed.host,
              port: this.configuration.seed.port,
              metadata: {
                maximumAcceptedConnections:
                  this.configuration.maximumAcceptedConnections,
              },
            });
          }
        }
      );
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    await Promise.all(
      Array.from(this.outgoingSocketsByNodeIdentifier.values()).flatMap(
        (nodeSocketSet) => {
          return Array.from(nodeSocketSet).map((socket) => {
            return new Promise<void>((resolve) => {
              socket.once('disconnect', () => {
                resolve();
              });
              socket.disconnect();
              if (!socket.connected) {
                resolve();
              }
            });
          });
        }
      )
    );

    this.outgoingSocketsByNodeIdentifier.clear();

    this.eventUnsubscribeFunctions.forEach((unsubscribe) => {
      unsubscribe();
    });

    this.eventUnsubscribeFunctions.length = 0;

    await new Promise<void>((resolve) => {
      this.socketIoServer.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });

    this.isRunning = false;

    if (this.runResolver) {
      this.runResolver();
      this.runResolver = undefined;
    }
  }

  public getKnownNodes(): KnownNode[] {
    return this.knownNodeStore.getNodes();
  }

  private registerSocketIoServerHandlers(): void {
    this.socketIoServer.on('connection', (socket) => {
      const registerHandler = (payload: NodeRegistrationPayload): void => {
        this.registerIncomingConnection(socket, payload);
      };

      socket.on(REGISTRATION_EVENT, registerHandler);

      socket.on('disconnect', () => {
        this.registeredIncomingSocketIdentifiers.delete(socket.id);
        socket.off(REGISTRATION_EVENT, registerHandler);
      });
    });
  }

  private registerIncomingConnection(
    socket: SocketIoServerSocket,
    payload: NodeRegistrationPayload
  ): void {
    if (!isValidUuidV4(payload.id)) {
      return;
    }

    if (this.registeredIncomingSocketIdentifiers.has(socket.id)) {
      return;
    }

    this.registeredIncomingSocketIdentifiers.add(socket.id);

    const knownNode: KnownNode = {
      id: payload.id,
      name: payload.name,
      host: payload.host,
      port: payload.port,
      metadata: {
        maximumAcceptedConnections: payload.metadata.maximumAcceptedConnections,
      },
    };

    this.knownNodeStore.upsertNode(knownNode);

    const discoveryNodes = this.knownNodeStore.getNodes().filter((node) => {
      return node.id !== payload.id;
    });

    socket.emit(DISCOVERY_EVENT, discoveryNodes);

    this.connectToKnownNode(knownNode);
  }

  private connectToKnownNode(node: KnownNode): void {
    if (node.id === this.configuration.id) {
      return;
    }

    const activeSocketSet =
      this.outgoingSocketsByNodeIdentifier.get(node.id) ??
      new Set<SocketIoClientSocket>();
    const inboundConnectionOffset = 1;
    const targetConnectionCount = Math.max(
      1,
      node.metadata.maximumAcceptedConnections - inboundConnectionOffset
    );

    const missingConnectionCount = targetConnectionCount - activeSocketSet.size;

    if (missingConnectionCount <= 0) {
      return;
    }

    this.outgoingSocketsByNodeIdentifier.set(node.id, activeSocketSet);

    for (
      let connectionIndex = 0;
      connectionIndex < missingConnectionCount;
      connectionIndex += 1
    ) {
      const socket = createSocketIoClient(
        createSocketAddress(node.host, node.port),
        {
          transports: ['websocket'],
          reconnection: true,
        }
      );

      const onConnect = (): void => {
        socket.emit(REGISTRATION_EVENT, {
          id: this.configuration.id,
          name: this.configuration.name,
          host: this.configuration.host,
          port: this.configuration.port,
          metadata: {
            maximumAcceptedConnections:
              this.configuration.maximumAcceptedConnections,
          },
        } satisfies NodeRegistrationPayload);
      };

      const onDiscovery = (discoveryNodes: KnownNode[]): void => {
        discoveryNodes.forEach((discoveredNode) => {
          this.knownNodeStore.upsertNode(discoveredNode);
          this.connectToKnownNode(discoveredNode);
        });
      };

      const onDisconnect = (): void => {
        activeSocketSet.delete(socket);
      };

      socket.on('connect', onConnect);
      socket.on(DISCOVERY_EVENT, onDiscovery);
      socket.on('disconnect', onDisconnect);

      const unsubscribe = (): void => {
        socket.off('connect', onConnect);
        socket.off(DISCOVERY_EVENT, onDiscovery);
        socket.off('disconnect', onDisconnect);
      };

      this.eventUnsubscribeFunctions.push(unsubscribe);

      activeSocketSet.add(socket);
    }
  }
}
