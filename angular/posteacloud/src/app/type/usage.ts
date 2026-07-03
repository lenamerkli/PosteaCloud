// 1. DTO — matches JSON structure returned by the backend

export interface PartitionUsageDto {
  partition_id: string;
  capacity: number;
  used: number;
}

// 2. Response wrapper
export interface UsageResponse {
  success?: string;
  message?: string;
  error?: string;
  total_capacity: number;
  total_used: number;
  partitions: PartitionUsageDto[];
}

// 3. Domain classes
export class PartitionUsage {
  partitionId: string;
  capacity: number;
  used: number;

  constructor(dto: PartitionUsageDto) {
    this.partitionId = dto.partition_id;
    this.capacity = dto.capacity;
    this.used = dto.used;
  }
}

export class Usage {
  totalCapacity: number;
  totalUsed: number;
  partitions: PartitionUsage[];

  constructor(dto: UsageResponse) {
    this.totalCapacity = dto.total_capacity;
    this.totalUsed = dto.total_used;
    this.partitions = dto.partitions.map((p) => new PartitionUsage(p));
  }
}