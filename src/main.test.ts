import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './main';

const runningApplications: Array<ReturnType<typeof createApp>> = [];

afterEach(async () => {
  await Promise.all(
    runningApplications.map((application) => application.stop())
  );
  runningApplications.length = 0;
});

describe('createApp', () => {
  it('runs and stops the application programmatically', async () => {
    const application = createApp();
    runningApplications.push(application);

    const runPromise = application.run(0);

    await new Promise((resolve) => setTimeout(resolve, 30));

    await application.stop();

    await expect(runPromise).resolves.toBeUndefined();
  });

  it('stops the application when SIGINT is emitted', async () => {
    const application = createApp();
    runningApplications.push(application);

    const runPromise = application.run(0);

    await new Promise((resolve) => setTimeout(resolve, 30));

    process.emit('SIGINT');

    await expect(runPromise).resolves.toBeUndefined();
  });
});
