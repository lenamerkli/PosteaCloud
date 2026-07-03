// 1. DTO — matches JSON structure returned by the backend
export interface IpScoreDto {
  ip: string;
  score: number;
  description: string;
}

// 2. Response wrappers
export interface IpScoreResponse {
  success?: string;
  message?: string;
  error?: string;
  ip: IpScoreDto;
}

export interface IpScoresResponse {
  success?: string;
  message?: string;
  error?: string;
  ips: IpScoreDto[];
}

// 3. Domain class
export class IpScore {
  ip: string;
  score: number;
  description: string;

  constructor(dto: IpScoreDto) {
    this.ip = dto.ip;
    this.score = dto.score;
    this.description = dto.description;
  }
}