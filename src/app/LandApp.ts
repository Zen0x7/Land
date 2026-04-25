import express, { type Express, type Request, type Response } from 'express';
import { CronJob } from 'cron';
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
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
import {
  REGISTRATION_EVENT,
  DISCOVERY_EVENT,
  LATENCY_PING_EVENT,
  SYSTEM_TOPOLOGY_UPDATED_EVENT,
} from '../events/clusterEvents';
import type { App } from './appTypes';
import type { AppConfiguration } from '../configuration/appConfiguration';
import type {
  KnownNode,
  NodeRegistrationPayload,
} from '../domain/node/nodeTypes';
import type {
  ClusterConnection,
  TopologySnapshot,
  ConnectionDirection,
  ConnectionStatus,
} from '../domain/connection/connectionTypes';
import { useKnownNodeStore } from '../store/knownNodeStore';
import { isValidUuidV4 } from '../shared/validation/isValidUuidV4';
import { createSocketAddress } from '../shared/network/createSocketAddress';

interface MutableConnectionRecord extends ClusterConnection {
  latencySamplesTotal: number;
  lastReadBytesSnapshot: number;
  lastWrittenBytesSnapshot: number;
  lastThroughputCalculatedAt: number;
}

const nodeSocketPath = '/nodes';
const clientSocketPath = '/clients';

interface SocketTrafficObservable {
  onAny(listener: (event: string, ...args: unknown[]) => void): void;
  offAny(listener?: (event: string, ...args: unknown[]) => void): void;
  onAnyOutgoing(listener: (event: string, ...args: unknown[]) => void): void;
  offAnyOutgoing(listener?: (event: string, ...args: unknown[]) => void): void;
}

interface LatencyMeasurableSocket extends SocketTrafficObservable {
  connected: boolean;
  timeout(milliseconds: number): {
    emit(
      event: string,
      sentDateInMilliseconds: number,
      callback: (
        error: Error | null,
        responseDateInMilliseconds?: number
      ) => void
    ): void;
  };
}

export class LandApp implements App {
  private readonly configuration: AppConfiguration;
  private readonly expressApplication: Express;
  private readonly httpServer: HttpServer;
  private readonly nodeSocketServer: SocketIoServer;
  private readonly clientSocketServer: SocketIoServer;
  private readonly knownNodeStore: ReturnType<typeof useKnownNodeStore>;
  private readonly outgoingSocketsByNodeIdentifier = new Map<
    string,
    Set<SocketIoClientSocket>
  >();
  private readonly registeredIncomingSocketIdentifiers = new Set<string>();
  private readonly connectionByIdentifier = new Map<
    string,
    MutableConnectionRecord
  >();
  private readonly connectionIdentifierBySocketIdentifier = new Map<
    string,
    string
  >();
  private readonly latencySocketByConnectionIdentifier = new Map<
    string,
    LatencyMeasurableSocket
  >();
  private metricsSampleCronJob?: CronJob;
  private readonly eventUnsubscribeFunctions: Array<() => void> = [];
  private hasPendingTopologyBroadcast = false;
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

    this.nodeSocketServer = new SocketIoServer(this.httpServer, {
      ...socketServerOptions,
      path: nodeSocketPath,
    });

    this.clientSocketServer = new SocketIoServer(this.httpServer, {
      ...socketServerOptions,
      path: clientSocketPath,
      cors: {
        origin: '*',
      },
    });

    this.knownNodeStore = useKnownNodeStore();

    this.registerSystemRoutes();
    this.registerNodeSocketServerHandlers();
    this.registerClientSocketServerHandlers();
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
          this.startMetricsSampling();
          this.broadcastSystemTopology();

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

    this.stopMetricsSampling();

    await new Promise<void>((resolve) => {
      this.nodeSocketServer.close(() => {
        this.clientSocketServer.close(() => {
          this.httpServer.close(() => {
            resolve();
          });
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

  public getConnections(): ClusterConnection[] {
    return this.getConnectionList();
  }

  public getTopologySnapshot(): TopologySnapshot {
    return this.createTopologySnapshot();
  }

  private registerSystemRoutes(): void {
    const systemPublicDirectoryPath = this.resolveSystemPublicDirectoryPath();

    this.expressApplication.get(
      '/system/api/topology',
      (_request, response) => {
        response.json(this.createTopologySnapshot());
      }
    );

    this.expressApplication.get('/system/api/nodes', (_request, response) => {
      response.json(this.createTopologySnapshot().nodes);
    });

    this.expressApplication.get(
      '/system/api/connections',
      (_request, response) => {
        response.json(this.getConnectionList());
      }
    );

    this.expressApplication.use(
      '/system',
      express.static(systemPublicDirectoryPath, {
        extensions: ['html'],
      })
    );

    this.expressApplication.get(
      '/system',
      (_request: Request, response: Response) => {
        response.sendFile(join(systemPublicDirectoryPath, 'index.html'));
      }
    );
  }

  private resolveSystemPublicDirectoryPath(): string {
    const candidateDirectoryPaths = [
      join(process.cwd(), 'dist/system/public'),
      join(process.cwd(), 'src/system/public'),
      join(process.cwd(), 'system/public'),
    ];

    const existingDirectoryPath = candidateDirectoryPaths.find(
      (directoryPath) => {
        const requiredFilePaths = [
          join(directoryPath, 'index.html'),
          join(directoryPath, 'assets/system-admin.css'),
          join(directoryPath, 'assets/admin/main.js'),
        ];

        return requiredFilePaths.every((requiredFilePath) => {
          return existsSync(requiredFilePath);
        });
      }
    );

    if (!existingDirectoryPath) {
      throw new Error(
        `Unable to find system public assets. Checked: ${candidateDirectoryPaths.join(', ')}`
      );
    }

    return existingDirectoryPath;
  }

  private startMetricsSampling(): void {
    if (this.metricsSampleCronJob) {
      return;
    }

    this.metricsSampleCronJob = CronJob.from({
      cronTime: '* * * * * *',
      onTick: () => {
        this.sampleAndBroadcastConnectionMetrics();
      },
      start: true,
    });
  }

  private stopMetricsSampling(): void {
    if (this.metricsSampleCronJob) {
      this.metricsSampleCronJob.stop();
      this.metricsSampleCronJob = undefined;
    }

    this.latencySocketByConnectionIdentifier.clear();
  }

  private sampleAndBroadcastConnectionMetrics(): void {
    const sampleDateInMilliseconds = Date.now();

    this.connectionByIdentifier.forEach((connectionRecord) => {
      this.refreshConnectionThroughputRates(
        connectionRecord,
        sampleDateInMilliseconds
      );
    });

    this.latencySocketByConnectionIdentifier.forEach(
      (socket, connectionIdentifier) => {
        this.measureLatency(connectionIdentifier, socket);
      }
    );

    this.markTopologyBroadcastAsPending();
    this.broadcastSystemTopologyIfPending();
  }

  private registerNodeSocketServerHandlers(): void {
    this.nodeSocketServer.on('connection', (socket) => {
      const initialSocketIdentifier =
        socket.id ?? `pending-socket-${Date.now()}`;

      const connectionIdentifier = this.registerConnection({
        socketIdentifier: initialSocketIdentifier,
        remoteNodeIdentifier: `unknown-${socket.id}`,
        remoteNodeName: 'unknown',
        remoteHost: 'unknown',
        remotePort: 0,
        direction: 'incoming',
        status: 'connected',
      });

      const registerHandler = (payload: NodeRegistrationPayload): void => {
        this.registerIncomingConnection(socket, payload, connectionIdentifier);
      };

      const unregisterSocketTrafficObservers =
        this.registerSocketTrafficObservers(connectionIdentifier, socket);

      socket.on(REGISTRATION_EVENT, registerHandler);
      socket.on(
        LATENCY_PING_EVENT,
        (_sentDateInMilliseconds: number, acknowledge) => {
          acknowledge(Date.now());
        }
      );

      this.latencySocketByConnectionIdentifier.set(
        connectionIdentifier,
        socket
      );

      socket.on('disconnect', () => {
        this.registeredIncomingSocketIdentifiers.delete(socket.id);
        socket.off(REGISTRATION_EVENT, registerHandler);
        this.updateConnectionStatus(connectionIdentifier, 'disconnected');

        this.latencySocketByConnectionIdentifier.delete(connectionIdentifier);

        unregisterSocketTrafficObservers();
      });
    });
  }

  private registerClientSocketServerHandlers(): void {
    this.clientSocketServer.on('connection', (socket) => {
      socket.emit(SYSTEM_TOPOLOGY_UPDATED_EVENT, this.createTopologySnapshot());
    });
  }

  private registerIncomingConnection(
    socket: SocketIoServerSocket,
    payload: NodeRegistrationPayload,
    connectionIdentifier: string
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

    this.updateConnectionRemoteNode(connectionIdentifier, knownNode);

    const discoveryNodes = this.knownNodeStore.getNodes().filter((node) => {
      return node.id !== payload.id;
    });

    socket.emit(DISCOVERY_EVENT, discoveryNodes);

    this.markTopologyBroadcastAsPending();
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
          path: nodeSocketPath,
        }
      );

      const initialSocketIdentifier =
        socket.id ?? `pending-socket-${Date.now()}`;

      const connectionIdentifier = this.registerConnection({
        socketIdentifier: initialSocketIdentifier,
        remoteNodeIdentifier: node.id,
        remoteNodeName: node.name,
        remoteHost: node.host,
        remotePort: node.port,
        direction: 'outgoing',
        status: 'connecting',
      });

      this.latencySocketByConnectionIdentifier.set(
        connectionIdentifier,
        socket
      );

      const onConnect = (): void => {
        this.refreshSocketIdentifier(
          connectionIdentifier,
          socket.id ?? initialSocketIdentifier
        );
        this.updateConnectionStatus(connectionIdentifier, 'connected');

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

        this.measureLatency(connectionIdentifier, socket);
      };

      const onDiscovery = (discoveryNodes: KnownNode[]): void => {
        discoveryNodes.forEach((discoveredNode) => {
          this.knownNodeStore.upsertNode(discoveredNode);
          this.connectToKnownNode(discoveredNode);
        });

        this.markTopologyBroadcastAsPending();
      };

      const onLatencyPing = (
        _sentDateInMilliseconds: number,
        acknowledge: (dateInMilliseconds: number) => void
      ): void => {
        acknowledge(Date.now());
      };

      const unregisterSocketTrafficObservers =
        this.registerSocketTrafficObservers(connectionIdentifier, socket);

      const onDisconnect = (): void => {
        activeSocketSet.delete(socket);
        this.updateConnectionStatus(connectionIdentifier, 'disconnected');

        this.latencySocketByConnectionIdentifier.delete(connectionIdentifier);

        unregisterSocketTrafficObservers();
      };

      socket.on('connect', onConnect);
      socket.on(DISCOVERY_EVENT, onDiscovery);
      socket.on(LATENCY_PING_EVENT, onLatencyPing);
      socket.on('disconnect', onDisconnect);

      const unsubscribe = (): void => {
        socket.off('connect', onConnect);
        socket.off(DISCOVERY_EVENT, onDiscovery);
        socket.off(LATENCY_PING_EVENT, onLatencyPing);
        socket.off('disconnect', onDisconnect);
      };

      this.eventUnsubscribeFunctions.push(unsubscribe);

      activeSocketSet.add(socket);
    }
  }

  private registerConnection(connection: {
    socketIdentifier: string;
    remoteNodeIdentifier: string;
    remoteNodeName: string;
    remoteHost: string;
    remotePort: number;
    direction: ConnectionDirection;
    status: ConnectionStatus;
  }): string {
    const nowIsoDate = new Date().toISOString();
    const connectionIdentifier = `${connection.direction}-${this.configuration.id}-${connection.socketIdentifier}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const connectionRecord: MutableConnectionRecord = {
      id: connectionIdentifier,
      socketIdentifier: connection.socketIdentifier,
      localNodeIdentifier: this.configuration.id,
      remoteNodeIdentifier: connection.remoteNodeIdentifier,
      remoteNodeName: connection.remoteNodeName,
      remoteHost: connection.remoteHost,
      remotePort: connection.remotePort,
      direction: connection.direction,
      status: connection.status,
      connectedAt: connection.status === 'connected' ? nowIsoDate : null,
      updatedAt: nowIsoDate,
      metrics: {
        lastLatencyInMilliseconds: null,
        averageLatencyInMilliseconds: null,
        sampleCount: 0,
        lastMeasuredAt: null,
        totalReadBytes: 0,
        totalWrittenBytes: 0,
        totalReadKilobytes: 0,
        totalWrittenKilobytes: 0,
        totalReadMegabytes: 0,
        totalWrittenMegabytes: 0,
        readBytesPerSecond: 0,
        writeBytesPerSecond: 0,
        readKilobytesPerSecond: 0,
        writeKilobytesPerSecond: 0,
        readMegabytesPerSecond: 0,
        writeMegabytesPerSecond: 0,
      },
      latencySamplesTotal: 0,
      lastReadBytesSnapshot: 0,
      lastWrittenBytesSnapshot: 0,
      lastThroughputCalculatedAt: Date.now(),
    };

    this.connectionByIdentifier.set(connectionIdentifier, connectionRecord);
    this.connectionIdentifierBySocketIdentifier.set(
      connection.socketIdentifier,
      connectionIdentifier
    );

    this.markTopologyBroadcastAsPending();

    return connectionIdentifier;
  }

  private refreshSocketIdentifier(
    connectionIdentifier: string,
    socketIdentifier: string
  ): void {
    const connectionRecord =
      this.connectionByIdentifier.get(connectionIdentifier);
    if (!connectionRecord) {
      return;
    }

    if (connectionRecord.socketIdentifier !== socketIdentifier) {
      this.connectionIdentifierBySocketIdentifier.delete(
        connectionRecord.socketIdentifier
      );
      connectionRecord.socketIdentifier = socketIdentifier;
      this.connectionIdentifierBySocketIdentifier.set(
        socketIdentifier,
        connectionIdentifier
      );
      connectionRecord.updatedAt = new Date().toISOString();
      this.markTopologyBroadcastAsPending();
    }
  }

  private updateConnectionStatus(
    connectionIdentifier: string,
    status: ConnectionStatus
  ): void {
    const connectionRecord =
      this.connectionByIdentifier.get(connectionIdentifier);
    if (!connectionRecord) {
      return;
    }

    connectionRecord.status = status;
    connectionRecord.updatedAt = new Date().toISOString();

    if (status === 'connected' && !connectionRecord.connectedAt) {
      connectionRecord.connectedAt = connectionRecord.updatedAt;
    }

    this.markTopologyBroadcastAsPending();
  }

  private updateConnectionRemoteNode(
    connectionIdentifier: string,
    node: KnownNode
  ): void {
    const connectionRecord =
      this.connectionByIdentifier.get(connectionIdentifier);
    if (!connectionRecord) {
      return;
    }

    connectionRecord.remoteNodeIdentifier = node.id;
    connectionRecord.remoteNodeName = node.name;
    connectionRecord.remoteHost = node.host;
    connectionRecord.remotePort = node.port;
    connectionRecord.updatedAt = new Date().toISOString();

    this.markTopologyBroadcastAsPending();
  }

  private registerSocketTrafficObservers(
    connectionIdentifier: string,
    socket: SocketTrafficObservable
  ): () => void {
    const onIncomingEvent = (event: string, ...args: unknown[]): void => {
      this.registerConnectionTrafficRead(connectionIdentifier, event, args);
    };

    const onOutgoingEvent = (event: string, ...args: unknown[]): void => {
      this.registerConnectionTrafficWrite(connectionIdentifier, event, args);
    };

    socket.onAny(onIncomingEvent);
    socket.onAnyOutgoing(onOutgoingEvent);

    return () => {
      socket.offAny(onIncomingEvent);
      socket.offAnyOutgoing(onOutgoingEvent);
    };
  }

  private registerConnectionTrafficRead(
    connectionIdentifier: string,
    event: string,
    args: unknown[]
  ): void {
    const payloadSizeInBytes = this.estimatePayloadSizeInBytes(event, args);
    this.updateConnectionTrafficMetrics(
      connectionIdentifier,
      payloadSizeInBytes,
      0
    );
  }

  private registerConnectionTrafficWrite(
    connectionIdentifier: string,
    event: string,
    args: unknown[]
  ): void {
    const payloadSizeInBytes = this.estimatePayloadSizeInBytes(event, args);
    this.updateConnectionTrafficMetrics(
      connectionIdentifier,
      0,
      payloadSizeInBytes
    );
  }

  private estimatePayloadSizeInBytes(event: string, args: unknown[]): number {
    const payloadToMeasure = {
      event,
      args,
    };

    try {
      return Buffer.byteLength(JSON.stringify(payloadToMeasure), 'utf8');
    } catch {
      return Buffer.byteLength(event, 'utf8');
    }
  }

  private updateConnectionTrafficMetrics(
    connectionIdentifier: string,
    readBytesDelta: number,
    writtenBytesDelta: number
  ): void {
    const connectionRecord =
      this.connectionByIdentifier.get(connectionIdentifier);

    if (!connectionRecord) {
      return;
    }

    connectionRecord.metrics.totalReadBytes += readBytesDelta;
    connectionRecord.metrics.totalWrittenBytes += writtenBytesDelta;

    connectionRecord.metrics.totalReadKilobytes = Number(
      (connectionRecord.metrics.totalReadBytes / 1024).toFixed(4)
    );
    connectionRecord.metrics.totalWrittenKilobytes = Number(
      (connectionRecord.metrics.totalWrittenBytes / 1024).toFixed(4)
    );
    connectionRecord.metrics.totalReadMegabytes = Number(
      (connectionRecord.metrics.totalReadBytes / 1024 / 1024).toFixed(6)
    );
    connectionRecord.metrics.totalWrittenMegabytes = Number(
      (connectionRecord.metrics.totalWrittenBytes / 1024 / 1024).toFixed(6)
    );

    this.refreshConnectionThroughputRates(connectionRecord, Date.now());

    connectionRecord.updatedAt = new Date().toISOString();
    this.markTopologyBroadcastAsPending();
  }

  private refreshConnectionThroughputRates(
    connectionRecord: MutableConnectionRecord,
    sampleDateInMilliseconds: number
  ): void {
    const elapsedMilliseconds =
      sampleDateInMilliseconds - connectionRecord.lastThroughputCalculatedAt;

    if (elapsedMilliseconds <= 0) {
      return;
    }

    const elapsedSeconds = elapsedMilliseconds / 1000;
    const readBytesSinceLastSnapshot =
      connectionRecord.metrics.totalReadBytes -
      connectionRecord.lastReadBytesSnapshot;
    const writtenBytesSinceLastSnapshot =
      connectionRecord.metrics.totalWrittenBytes -
      connectionRecord.lastWrittenBytesSnapshot;

    connectionRecord.metrics.readBytesPerSecond = Number(
      (readBytesSinceLastSnapshot / elapsedSeconds).toFixed(4)
    );
    connectionRecord.metrics.writeBytesPerSecond = Number(
      (writtenBytesSinceLastSnapshot / elapsedSeconds).toFixed(4)
    );
    connectionRecord.metrics.readKilobytesPerSecond = Number(
      (connectionRecord.metrics.readBytesPerSecond / 1024).toFixed(4)
    );
    connectionRecord.metrics.writeKilobytesPerSecond = Number(
      (connectionRecord.metrics.writeBytesPerSecond / 1024).toFixed(4)
    );
    connectionRecord.metrics.readMegabytesPerSecond = Number(
      (connectionRecord.metrics.readBytesPerSecond / 1024 / 1024).toFixed(6)
    );
    connectionRecord.metrics.writeMegabytesPerSecond = Number(
      (connectionRecord.metrics.writeBytesPerSecond / 1024 / 1024).toFixed(6)
    );

    connectionRecord.lastReadBytesSnapshot =
      connectionRecord.metrics.totalReadBytes;
    connectionRecord.lastWrittenBytesSnapshot =
      connectionRecord.metrics.totalWrittenBytes;
    connectionRecord.lastThroughputCalculatedAt = sampleDateInMilliseconds;
    connectionRecord.updatedAt = new Date(
      sampleDateInMilliseconds
    ).toISOString();
  }

  private measureLatency(
    connectionIdentifier: string,
    socket: LatencyMeasurableSocket
  ): void {
    if (!socket.connected) {
      return;
    }

    const sentDateInMilliseconds = Date.now();

    socket
      .timeout(3_000)
      .emit(
        LATENCY_PING_EVENT,
        sentDateInMilliseconds,
        (error: Error | null, responseDateInMilliseconds?: number) => {
          if (error) {
            return;
          }

          const elapsedMilliseconds = Date.now() - sentDateInMilliseconds;
          const connectionRecord =
            this.connectionByIdentifier.get(connectionIdentifier);

          if (!connectionRecord) {
            return;
          }

          connectionRecord.metrics.lastLatencyInMilliseconds =
            elapsedMilliseconds;
          connectionRecord.latencySamplesTotal += elapsedMilliseconds;
          connectionRecord.metrics.sampleCount += 1;
          connectionRecord.metrics.averageLatencyInMilliseconds = Math.round(
            connectionRecord.latencySamplesTotal /
              connectionRecord.metrics.sampleCount
          );
          connectionRecord.metrics.lastMeasuredAt = new Date(
            responseDateInMilliseconds ?? Date.now()
          ).toISOString();
          connectionRecord.updatedAt = new Date().toISOString();

          this.markTopologyBroadcastAsPending();
        }
      );
  }

  private markTopologyBroadcastAsPending(): void {
    this.hasPendingTopologyBroadcast = true;
  }

  private broadcastSystemTopologyIfPending(): void {
    if (!this.hasPendingTopologyBroadcast) {
      return;
    }

    this.broadcastSystemTopology();
  }

  private getConnectionList(): ClusterConnection[] {
    return Array.from(this.connectionByIdentifier.values()).map(
      (connection) => {
        return {
          id: connection.id,
          socketIdentifier: connection.socketIdentifier,
          localNodeIdentifier: connection.localNodeIdentifier,
          remoteNodeIdentifier: connection.remoteNodeIdentifier,
          remoteNodeName: connection.remoteNodeName,
          remoteHost: connection.remoteHost,
          remotePort: connection.remotePort,
          direction: connection.direction,
          status: connection.status,
          connectedAt: connection.connectedAt,
          updatedAt: connection.updatedAt,
          metrics: structuredClone(connection.metrics),
        };
      }
    );
  }

  private createTopologySnapshot(): TopologySnapshot {
    const connections = this.getConnectionList();
    const nodesByIdentifier = new Map<string, KnownNode>();

    nodesByIdentifier.set(this.configuration.id, {
      id: this.configuration.id,
      name: this.configuration.name,
      host: this.configuration.host,
      port: this.configuration.port,
      metadata: {
        maximumAcceptedConnections:
          this.configuration.maximumAcceptedConnections,
      },
    });

    for (const node of this.getKnownNodes()) {
      nodesByIdentifier.set(node.id, node);
    }

    for (const connection of connections) {
      if (!nodesByIdentifier.has(connection.remoteNodeIdentifier)) {
        nodesByIdentifier.set(connection.remoteNodeIdentifier, {
          id: connection.remoteNodeIdentifier,
          name: connection.remoteNodeName,
          host: connection.remoteHost,
          port: connection.remotePort,
          metadata: {
            maximumAcceptedConnections: 0,
          },
        });
      }
    }

    const nodes = Array.from(nodesByIdentifier.values()).map((node) => {
      const isLocalNode = node.id === this.configuration.id;
      const incomingConnections = connections.filter((connection) => {
        if (isLocalNode) {
          return (
            connection.localNodeIdentifier === node.id &&
            connection.direction === 'incoming'
          );
        }

        return (
          connection.remoteNodeIdentifier === node.id &&
          connection.direction === 'incoming'
        );
      });

      const outgoingConnections = connections.filter((connection) => {
        if (isLocalNode) {
          return (
            connection.localNodeIdentifier === node.id &&
            connection.direction === 'outgoing'
          );
        }

        return (
          connection.remoteNodeIdentifier === node.id &&
          connection.direction === 'outgoing'
        );
      });

      return {
        id: node.id,
        name: node.name,
        host: node.host,
        port: node.port,
        isLocalNode,
        metadata: {
          maximumAcceptedConnections: node.metadata.maximumAcceptedConnections,
        },
        incomingConnections,
        outgoingConnections,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      localNode: {
        id: this.configuration.id,
        name: this.configuration.name,
        host: this.configuration.host,
        port: this.configuration.port,
        maximumAcceptedConnections:
          this.configuration.maximumAcceptedConnections,
      },
      nodes,
      connections,
    };
  }

  private broadcastSystemTopology(): void {
    this.hasPendingTopologyBroadcast = false;
    this.clientSocketServer.emit(
      SYSTEM_TOPOLOGY_UPDATED_EVENT,
      this.createTopologySnapshot()
    );
  }
}
