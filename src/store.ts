import { defineStore } from 'pinia';

export const useLandStore = defineStore('land', {
  state: () => ({
    count: 0,
    name: 'Land Framework'
  }),
  actions: {
    increment() {
      this.count++;
    }
  }
});
