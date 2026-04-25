import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App, type AppConfiguration } from './main';

const runningApplications: App[] = [];

const waitFor = async (
  assertion: () => void,
  timeoutInMilliseconds = 6_000,
  intervalInMilliseconds = 50
): Promise<void> => {
  const timeoutDate = Date.now() + timeoutInMilliseconds;

  while (Date.now() < timeoutDate) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) =>
        setTimeout(resolve, intervalInMilliseconds)
      );
    }
  }

  assertion();
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

  it('connects a seeded node and stores discovered nodes across the cluster', async () => {
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
    });
  });

  it('rejects an invalid app identifier that is not UUID v4', () => {
    expect(() => {
      createApp(
        createConfiguration({
          id: 'invalid-id',
          name: 'invalid-node',
          port: 3510,
        })
      );
    }).toThrowError('App configuration id must be a valid UUID v4.');
  });
});
