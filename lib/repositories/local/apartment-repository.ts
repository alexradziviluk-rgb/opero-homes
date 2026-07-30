export interface ApartmentRepository {
  list(): Promise<unknown[]>;
  getById(id: string): Promise<unknown | null>;
  save(payload: unknown): Promise<unknown>;
  remove(id: string): Promise<void>;
}

export const localApartmentRepository: ApartmentRepository = {
  async list() {
    return [];
  },
  async getById() {
    return null;
  },
  async save(payload) {
    return payload;
  },
  async remove() {},
};
