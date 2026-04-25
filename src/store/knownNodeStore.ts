import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { KnownNode } from '../domain/node/nodeTypes';

export const useKnownNodeStore = defineStore('knownNodeStore', () => {
  const nodesByIdentifier = ref<Record<string, KnownNode>>({});

  const nodes = computed(() => {
    return Object.values(nodesByIdentifier.value);
  });

  const upsertNode = (node: KnownNode): void => {
    nodesByIdentifier.value[node.id] = node;
  };

  const getNodes = (): KnownNode[] => {
    return nodes.value;
  };

  return {
    nodesByIdentifier,
    nodes,
    upsertNode,
    getNodes,
  };
});
