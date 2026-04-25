declare module 'https://unpkg.com/vue@3.5.22/dist/vue.esm-browser.prod.js' {
  export const createApp: (configuration: {
    components?: Record<string, unknown>;
    setup: () => Record<string, unknown>;
    template: string;
  }) => {
    use(plugin: unknown): void;
    mount(selector: string): void;
  };
  export const onMounted: (callback: () => void | Promise<void>) => void;
  export const onBeforeUnmount: (callback: () => void) => void;
  export const ref: <Value>(value: Value) => { value: Value };
  export const computed: <Value>(getter: () => Value) => { value: Value };
}

declare module 'https://unpkg.com/pinia@3.0.4/dist/pinia.esm-browser.prod.js' {
  export const createPinia: () => unknown;
  export const defineStore: <Store>(
    name: string,
    setup: () => Store
  ) => () => Store;
}

declare module 'https://cdn.socket.io/4.8.3/socket.io.esm.min.js' {
  export const io: (configuration: { path: string; transports: string[] }) => {
    on(event: string, callback: (payload: unknown) => void): void;
    disconnect(): void;
  };
}
