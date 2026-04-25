export const createSocketAddress = (host: string, port: number): string => {
  return `http://${host}:${port}`;
};
