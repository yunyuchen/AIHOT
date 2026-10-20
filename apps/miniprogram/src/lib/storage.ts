// 本机存储的封装：只存本机，不上传。所有 key 带版本号（形状改了就换版本号，旧 key 自然读不到）；读写都包 try/catch，
// 存储不可用（满了、被禁用、抛错）时读回 null、写回 false，不往外抛，阅读不受影响。
// 纯逻辑，底层的读写由调用方注入：小程序里是 wx-storage.ts 接的 Taro 存储，tests/ 里换成内存假的。
import type { BoardKey } from "../../config/boards";

/** 最近一次成功响应的快照：精选 tab 的元信息和精选第一页，日报 tab 的最新一期。 */
export type SnapshotKind = "meta" | "feed" | "daily";

/**
 * 规格“本机存储”表里的 key，只从这里取。收藏（saved.v1，300 条，满了提示不自动删）的读写和上限在 saved.ts，
 * 已读（read.v1，每个板块 1000 条，启动时删 30 天以前的，超上限先删最旧的）在 read.ts。
 */
export type StorageKey = "saved.v1" | "read.v1" | `snap.v1.${BoardKey}.${SnapshotKind}`;

export const STORAGE_KEYS = {
  saved: "saved.v1",
  read: "read.v1",
  snapshot: (board: BoardKey, kind: SnapshotKind): StorageKey => `snap.v1.${board}.${kind}`,
} as const;

/** 底层的同步读写（wx.getStorageSync 那一套）：读不到的 key 回什么都行，由 read 的 check 挡掉。 */
export interface StorageBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export interface Storage {
  /** 读一个 key，交给 check 核对形状；没有、存储不可用、形状不对都回 null。 */
  read<T>(key: StorageKey, check: (value: unknown) => T | null): T | null;
  /** 整份写入；存储不可用时回 false（收藏据此提示失败），不抛。 */
  write(key: StorageKey, value: unknown): boolean;
  remove(key: StorageKey): boolean;
}

/** backend 为 null（拿不到存储）时什么都读不到、什么都写不进。 */
export function createStorage(backend: StorageBackend | null): Storage {
  return {
    read(key, check) {
      try {
        return backend ? check(backend.get(key)) : null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        if (!backend) return false;
        backend.set(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        if (!backend) return false;
        backend.remove(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** 快照：那次成功的响应原样存下，加上拉取时的本机时刻。 */
export interface Snapshot<T> {
  data: T;
  fetchedAt: number;
}

/** 读快照；data 再交给 check 核对（旧版本写的、被改坏的都当没有）。 */
export function readSnapshot<T>(storage: Storage, board: BoardKey, kind: SnapshotKind, check: (data: unknown) => T | null): Snapshot<T> | null {
  return storage.read(STORAGE_KEYS.snapshot(board, kind), (value) => {
    const record = value as Partial<Snapshot<unknown>> | null;
    if (!record || typeof record !== "object" || typeof record.fetchedAt !== "number") return null;
    const data = check(record.data);
    return data === null ? null : { data, fetchedAt: record.fetchedAt };
  });
}

/** 每次成功整份覆盖，不和旧快照合并。 */
export function writeSnapshot(storage: Storage, board: BoardKey, kind: SnapshotKind, data: unknown, fetchedAt: number): boolean {
  return storage.write(STORAGE_KEYS.snapshot(board, kind), { data, fetchedAt });
}

export function removeSnapshot(storage: Storage, board: BoardKey, kind: SnapshotKind): boolean {
  return storage.remove(STORAGE_KEYS.snapshot(board, kind));
}
