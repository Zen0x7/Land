export const formatKilobytesPerSecond = (value) => {
  return `${Number(value ?? 0).toFixed(3)} KB/s`;
};

export const formatMegabytes = (value) => {
  return `${Number(value ?? 0).toFixed(4)} MB`;
};

export const formatMilliseconds = (value) => {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value} ms`;
};

export const formatTimestamp = (isoDate) => {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleTimeString();
};

export const formatNodeAddress = (node) => {
  return `${node.host}:${node.port}`;
};
