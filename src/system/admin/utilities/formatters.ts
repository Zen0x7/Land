interface AddressableNode {
  host: string;
  port: number;
}

export const formatKilobytesPerSecond = (
  value: number | null | undefined
): string => {
  return `${Number(value ?? 0).toFixed(3)} KB/s`;
};

export const formatMegabytes = (value: number | null | undefined): string => {
  return `${Number(value ?? 0).toFixed(4)} MB`;
};

export const formatMilliseconds = (
  value: number | null | undefined
): string => {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value} ms`;
};

export const formatTimestamp = (isoDate: string | null | undefined): string => {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleTimeString();
};

export const formatNodeAddress = (node: AddressableNode): string => {
  return `${node.host}:${node.port}`;
};
