import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';

export interface App {
  run(port?: number): Promise<void>;
  stop(): Promise<void>;
}

class LandApp implements App {
  private readonly expressApplication: Express;
  private readonly httpServer: HttpServer;
  private readonly socketIoServer: SocketIoServer;
  private isRunning = false;
  private runResolver?: () => void;

  public constructor() {
    this.expressApplication = express();
    this.httpServer = createServer(this.expressApplication);
    this.socketIoServer = new SocketIoServer(this.httpServer);
  }

  public run(port = 3000): Promise<void> {
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

      this.httpServer.listen(port);
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

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
}

export const createApp = (): App => {
  return new LandApp();
};
