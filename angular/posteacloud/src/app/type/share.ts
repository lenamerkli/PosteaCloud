import { parseBackendDate } from '../other/date-parser';

// 1. DTO — matches JSON structure returned by the backend
export interface ShareDto {
  user_id: string;
  username: string;
  allow_write: boolean;
  created: string;
}

// 2. Response wrappers
export interface SharesResponse {
  success?: string;
  message?: string;
  error?: string;
  shares: ShareDto[];
}

export interface ShareCreatedResponse {
  success?: string;
  message?: string;
  error?: string;
  share_id: string;
}

// 3. Domain class
export class Share {
  userId: string;
  username: string;
  allowWrite: boolean;
  created: Date;

  constructor(dto: ShareDto) {
    this.userId = dto.user_id;
    this.username = dto.username;
    this.allowWrite = dto.allow_write;
    this.created = parseBackendDate(dto.created);
  }
}