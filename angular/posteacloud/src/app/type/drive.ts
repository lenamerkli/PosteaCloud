// 1. DTO — matches JSON structure returned by the backend
export interface DriveDto {
  id_: string;
  location: string;
  name: string;
  description: string;
}

// 2. Response wrappers
export interface DriveResponse {
  success?: string;
  message?: string;
  error?: string;
  drive: DriveDto;
}

export interface DrivesResponse {
  success?: string;
  message?: string;
  error?: string;
  drives: DriveDto[];
}

// 3. Domain class
export class Drive {
  id: string;
  location: string;
  name: string;
  description: string;

  constructor(dto: DriveDto) {
    this.id = dto.id_;
    this.location = dto.location;
    this.name = dto.name;
    this.description = dto.description;
  }
}