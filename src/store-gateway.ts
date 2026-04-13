export interface StoreGateway {
  listStores(): Promise<unknown>;
  getStore(storeId: string): Promise<unknown>;
}

export function createStoreGateway(endpoint: string): StoreGateway {
  return {
    async listStores() {
      return {
        command: 'store.list',
        endpoint,
        status: 'pending-mcp-integration'
      };
    },
    async getStore(storeId: string) {
      return {
        command: 'store.get',
        endpoint,
        storeId,
        status: 'pending-mcp-integration'
      };
    }
  };
}
