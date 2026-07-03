// 1. DTO — matches JSON structure returned by the backend

export interface DriveUsageDto {
  drive_id: string;
  capacity: number;
  used: number;
}

export interface PartitionUsageDto {
  partition_id: string;
  capacity: number;
  used: number;
}

export interface UserUsageDto {
  user_id: string;
  capacity: number;
  used: number;
}

// 2. Response wrapper
export interface AdminUsageResponse {
  success?: string;
  message?: string;
  error?: string;
  total_capacity: number;
  total_used: number;
  drives: DriveUsageDto[];
  partitions: PartitionUsageDto[];
  users: UserUsageDto[];
}

// 3. Domain class
export class AdminUsage {
  totalCapacity: number;
  totalUsed: number;
  drives: DriveUsageDto[];
  partitions: PartitionUsageDto[];
  users: UserUsageDto[];

  constructor(dto: AdminUsageResponse) {
    this.totalCapacity = dto.total_capacity;
    this.totalUsed = dto.total_used;
    this.drives = dto.drives;
    this.partitions = dto.partitions;
    this.users = dto.users;
  }
}