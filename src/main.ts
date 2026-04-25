import { createPinia, setActivePinia } from 'pinia';
import { useLandStore } from './store';

// Initialize Pinia for Node.js environment
const pinia = createPinia();
setActivePinia(pinia);

// Example usage
const store = useLandStore();

console.log('--- Land Framework Initialized ---');
console.log('Initial State:', store.name, 'Count:', store.count);

store.increment();

console.log('State after increment:', store.count);
console.log('---------------------------------');

export { pinia, useLandStore };
