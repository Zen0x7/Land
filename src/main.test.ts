import { afterEach, describe, expect, it } from 'vitest';
import { io as createSocketIoClient } from 'socket.io-client';
import { createApp, type App, type AppConfiguration } from './main';
import { SYSTEM_TOPOLOGY_UPDATED_EVENT } from './events/clusterEvents';

const runningApplications: App[] = [];

const waitFor = async (
  assertion: () => void | Promise<void>,
  timeoutInMilliseconds = 6_000,
  intervalInMilliseconds = 50
): Promise<void> => {
  const timeoutDate = Date.now() + timeoutInMilliseconds;

  while (Date.now() < timeoutDate) {
    try {
      await assertion();
      return;
    } catch {
      await new Promise((resolve) =>
        setTimeout(resolve, intervalInMilliseconds)
      );
    }
  }

  await assertion();
};

const createConfiguration = (
  configuration: Partial<AppConfiguration> &
    Pick<AppConfiguration, 'id' | 'name' | 'port'>
): AppConfiguration => {
  return {
    id: configuration.id,
    name: configuration.name,
    host: configuration.host ?? '127.0.0.1',
    port: configuration.port,
    maximumAcceptedConnections: configuration.maximumAcceptedConnections ?? 2,
    seed: configuration.seed,
  };
};

afterEach(async () => {
  await Promise.all(
    runningApplications.map((application) => {
      return application.stop();
    })
  );

  runningApplications.length = 0;
});

describe('createApp', () => {
  it('runs and stops the application programmatically', async () => {
    const application = createApp(
      createConfiguration({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'node-a',
        port: 3310,
      })
    );

    runningApplications.push(application);

    const runPromise = application.run();

    await new Promise((resolve) => setTimeout(resolve, 50));

    await application.stop();

    await expect(runPromise).resolves.toBeUndefined();
  });

  it('connects seeded nodes and stores discovered topology across the cluster', async () => {
    const firstApplication = createApp(
      createConfiguration({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'node-a',
        port: 3410,
        maximumAcceptedConnections: 2,
      })
    );

    const secondApplication = createApp(
      createConfiguration({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'node-b',
        port: 3411,
        maximumAcceptedConnections: 2,
        seed: {
          host: '127.0.0.1',
          port: 3410,
        },
      })
    );

    const thirdApplication = createApp(
      createConfiguration({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'node-c',
        port: 3412,
        maximumAcceptedConnections: 2,
        seed: {
          host: '127.0.0.1',
          port: 3411,
        },
      })
    );

    runningApplications.push(
      firstApplication,
      secondApplication,
      thirdApplication
    );

    void firstApplication.run();
    await new Promise((resolve) => setTimeout(resolve, 150));

    void secondApplication.run();
    await new Promise((resolve) => setTimeout(resolve, 150));

    void thirdApplication.run();

    await waitFor(() => {
      const nodesFromFirstApplication = firstApplication.getKnownNodes();
      const nodesFromSecondApplication = secondApplication.getKnownNodes();
      const nodesFromThirdApplication = thirdApplication.getKnownNodes();

      expect(nodesFromFirstApplication.map((node) => node.id).sort()).toEqual([
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ]);

      expect(nodesFromSecondApplication.map((node) => node.id).sort()).toEqual([
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ]);

      expect(nodesFromThirdApplication.map((node) => node.id).sort()).toEqual([
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ]);

      const firstConnections = firstApplication.getConnections();
      const secondConnections = secondApplication.getConnections();
      const thirdConnections = thirdApplication.getConnections();

      expect(firstConnections.length).toBeGreaterThan(0);
      expect(secondConnections.length).toBeGreaterThan(0);
      expect(thirdConnections.length).toBeGreaterThan(0);
    });
  });

  it('exposes system endpoints and publishes live topology updates for clients', async () => {
    const serverApplication = createApp(
      createConfiguration({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        name: 'node-dashboard',
        port: 3510,
        maximumAcceptedConnections: 2,
      })
    );

    const seededApplication = createApp(
      createConfiguration({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        name: 'node-seeded',
        port: 3511,
        maximumAcceptedConnections: 2,
        seed: {
          host: '127.0.0.1',
          port: 3510,
        },
      })
    );

    runningApplications.push(serverApplication, seededApplication);

    void serverApplication.run();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const initialTopologyResponse = await fetch(
      'http://127.0.0.1:3510/system/api/topology'
    );
    const initialTopology = await initialTopologyResponse.json();

    expect(initialTopology.localNode.id).toBe(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    );
    expect(Array.isArray(initialTopology.nodes)).toBe(true);
    expect(Array.isArray(initialTopology.connections)).toBe(true);

    const initialNodesResponse = await fetch(
      'http://127.0.0.1:3510/system/api/nodes'
    );
    const initialNodes = await initialNodesResponse.json();

    expect(Array.isArray(initialNodes)).toBe(true);

    const topologyUpdates: Array<{ generatedAt: string }> = [];

    const clientSocket = createSocketIoClient('ws://127.0.0.1:3510', {
      path: '/clients',
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      clientSocket.on(SYSTEM_TOPOLOGY_UPDATED_EVENT, (topologyPayload) => {
        topologyUpdates.push(topologyPayload);
        resolve();
      });
    });

    void seededApplication.run();

    await waitFor(() => {
      expect(topologyUpdates.length).toBeGreaterThan(1);
      const latestTopologyUpdate = topologyUpdates[topologyUpdates.length - 1];
      expect(latestTopologyUpdate.generatedAt).toBeTypeOf('string');
    });

    await waitFor(async () => {
      const connectionsResponse = await fetch(
        'http://127.0.0.1:3510/system/api/connections'
      );
      const connections = await connectionsResponse.json();

      expect(Array.isArray(connections)).toBe(true);
      expect(
        connections.some(
          (connection: {
            status: string;
            direction: string;
            metrics: { sampleCount: number };
          }) => {
            return (
              connection.direction === 'outgoing' &&
              ['connected', 'disconnected'].includes(connection.status) &&
              connection.metrics.sampleCount >= 1
            );
          }
        )
      ).toBe(true);
    });

    clientSocket.disconnect();
  });

  it('rejects an invalid app identifier that is not UUID v4', () => {
    expect(() => {
      createApp(
        createConfiguration({
          id: 'invalid-id',
          name: 'invalid-node',
          port: 3610,
        })
      );
    }).toThrowError('App configuration id must be a valid UUID v4.');
  });
});
