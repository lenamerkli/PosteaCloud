import { parseBackendDate } from '../other/date-parser';

// 1. DTO — matches JSON structure returned by the backend (Partition.to_json() plus enrichment)
export interface PartitionDto {
  id_: string;
  drive_id: string;
  name: string;
  owner_id: string;
  capacity: number;
  created: string;
  edited: string;
  viewed: string;
  deleted: string | null;
  hidden: boolean;
  owned: boolean;
  can_write: boolean;
}

// 2. Response wrappers
export interface PartitionResponse {
  success?: string;
  message?: string;
  error?: string;
  partition: PartitionDto;
}

export interface PartitionsResponse {
  success?: string;
  message?: string;
  error?: string;
  partitions: PartitionDto[];
}

// 3. Domain class
export class Partition {
  id: string;
  driveId: string;
  name: string;
  ownerId: string;
  capacity: number;
  created: Date;
  edited: Date;
  viewed: Date;
  deleted: Date | null;
  hidden: boolean;
  owned: boolean;
  canWrite: boolean;

  constructor(dto: PartitionDto) {
    this.id = dto.id_;
    this.driveId = dto.drive_id;
    this.name = dto.name;
    this.ownerId = dto.owner_id;
    this.capacity = dto.capacity;
    this.created = parseBackendDate(dto.created);
    this.edited = parseBackendDate(dto.edited);
    this.viewed = parseBackendDate(dto.viewed);
    this.deleted = dto.deleted ? parseBackendDate(dto.deleted) : null;
    this.hidden = dto.hidden;
    this.owned = dto.owned;
    this.canWrite = dto.can_write;
  }
}