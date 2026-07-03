import { Entry, EntryType } from '../type/entry';
import { Partition } from '../type/partition';

/**
 * A unified row shown in the file browser table. Partitions are displayed
 * exactly like folders at the root of the browser.
 */
export interface BrowserRow {
  id: string;
  name: string;
  rowType: EntryType | 'partition';
  size: number | null;
  edited: Date;
  owned: boolean;
  canWrite: boolean;
  deleted: Date | null;
  entry?: Entry;
  partition?: Partition;
}

export function partitionToRow(partition: Partition): BrowserRow {
  return {
    id: partition.id,
    name: partition.name,
    rowType: 'partition',
    size: null,
    edited: partition.edited,
    owned: partition.owned,
    canWrite: partition.canWrite,
    deleted: partition.deleted,
    partition,
  };
}

export function entryToRow(entry: Entry): BrowserRow {
  return {
    id: entry.id,
    name: entry.name,
    rowType: entry.type,
    size: entry.size,
    edited: entry.edited,
    owned: entry.owned,
    canWrite: entry.canWrite,
    deleted: entry.deleted,
    entry,
  };
}