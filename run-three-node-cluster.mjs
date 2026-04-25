import { createApp } from './dist/land.js';

const firstNodePort = 4100;
const secondNodePort = 4101;
const thirdNodePort = 4102;
const host = '127.0.0.1';

const applications = [
  createApp({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'node-one',
    host,
    port: firstNodePort,
    maximumAcceptedConnections: 3,
  }),
  createApp({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'node-two',
    host,
    port: secondNodePort,
    maximumAcceptedConnections: 3,
    seed: {
      host,
      port: firstNodePort,
    },
  }),
  createApp({
    id: '33333333-3333-4333-8333-333333333333',
    name: 'node-three',
    host,
    port: thirdNodePort,
    maximumAcceptedConnections: 3,
    seed: {
      host,
      port: secondNodePort,
    },
  }),
];

const stopApplications = async () => {
  await Promise.all(
    applications.map((application) => {
      return application.stop();
    })
  );
};

const startApplications = async () => {
  for (const application of applications) {
    void application.run();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log('Three-node cluster is running.');
  console.log(`Node one: http://${host}:${firstNodePort}/system`);
  console.log(`Node two: http://${host}:${secondNodePort}/system`);
  console.log(`Node three: http://${host}:${thirdNodePort}/system`);
  console.log('Press Ctrl+C to stop all nodes.');
};

process.once('SIGINT', async () => {
  await stopApplications();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await stopApplications();
  process.exit(0);
});

await startApplications();
