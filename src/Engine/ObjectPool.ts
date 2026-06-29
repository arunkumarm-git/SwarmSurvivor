export interface Poolable {
  active: boolean;
  spawn(...args: any[]): void;
  despawn(): void;
}

export class ObjectPool<T extends Poolable> {
  private pool: T[] = [];
  private createFn: () => T;

  constructor(createFn: () => T, initialSize: number = 0) {
    this.createFn = createFn;
    for (let i = 0; i < initialSize; i++) {
      const obj = this.createFn();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  /**
   * Retrieves an inactive object from the pool, activates it, and returns it.
   * If all objects are active, a new one is instantiated and added to the pool.
   */
  get(...args: any[]): T {
    let obj = this.pool.find((item) => !item.active);
    if (!obj) {
      obj = this.createFn();
      this.pool.push(obj);
    }
    obj.active = true;
    obj.spawn(...args);
    return obj;
  }

  /**
   * Releases an object back to the pool, marking it inactive.
   */
  release(obj: T): void {
    obj.active = false;
    obj.despawn();
  }

  /**
   * Returns a list of all currently active objects.
   */
  getActiveObjects(): T[] {
    return this.pool.filter((item) => item.active);
  }

  /**
   * Returns a list of all objects in the pool.
   */
  getAllObjects(): T[] {
    return this.pool;
  }

  /**
   * Clears the pool and releases all instances.
   */
  clear(): void {
    this.pool.forEach((item) => {
      if (item.active) {
        item.despawn();
      }
    });
    this.pool = [];
  }
}
