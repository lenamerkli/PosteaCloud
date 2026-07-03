import { parseBackendDate } from '../other/date-parser';

export type EntryType = 'file' | 'folder' | 'link';

// 1. DTO — matches JSON structure returned by the backend (Entry.to_json() plus enrichment)
export interface EntryDto {
  id_: string;
  type_: EntryType;
  name: string;
  parent_id: string | null;
  owner_id: string;
  partition_id: string;
  created: string;
  edited: string;
  viewed: string;
  deleted: string | null;
  hidden: boolean;
  size: number | null;
  hash_: string | null;
  encrypted: boolean | null;
  encryption_hash: string | null;
  target_id: string | null;
  target_partition_id: string | null;
  owned: boolean;
  can_write: boolean;
}

// 2. Response wrappers
export interface EntryResponse {
  success?: string;
  message?: string;
  error?: string;
  entry: EntryDto;
}

export interface EntriesResponse {
  success?: string;
  message?: string;
  error?: string;
  entries: EntryDto[];
}

export interface PathResponse {
  success?: string;
  message?: string;
  error?: string;
  path: (EntryDto | Record<string, unknown>)[];
}

// 3. Domain class
export class Entry {
  id: string;
  type: EntryType;
  name: string;
  parentId: string | null;
  ownerId: string;
  partitionId: string;
  created: Date;
  edited: Date;
  viewed: Date;
  deleted: Date | null;
  hidden: boolean;
  size: number | null;
  hash: string | null;
  encrypted: boolean | null;
  encryptionHash: string | null;
  targetId: string | null;
  targetPartitionId: string | null;
  owned: boolean;
  canWrite: boolean;

  constructor(dto: EntryDto) {
    this.id = dto.id_;
    this.type = dto.type_;
    this.name = dto.name;
    this.parentId = dto.parent_id;
    this.ownerId = dto.owner_id;
    this.partitionId = dto.partition_id;
    this.created = parseBackendDate(dto.created);
    this.edited = parseBackendDate(dto.edited);
    this.viewed = parseBackendDate(dto.viewed);
    this.deleted = dto.deleted ? parseBackendDate(dto.deleted) : null;
    this.hidden = dto.hidden;
    this.size = dto.size;
    this.hash = dto.hash_;
    this.encrypted = dto.encrypted;
    this.encryptionHash = dto.encryption_hash;
    this.targetId = dto.target_id;
    this.targetPartitionId = dto.target_partition_id;
    this.owned = dto.owned;
    this.canWrite = dto.can_write;
  }
}