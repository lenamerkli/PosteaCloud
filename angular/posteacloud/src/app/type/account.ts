import { parseBackendDate } from '../other/date-parser';

// 1. DTO — matches JSON structure returned by the backend
export interface AccountDto {
  id_: string;
  username: string;
  email: string;
  password: string;
  salt: string;
  totp: string;
  created_at: string;
  last_login: string;
  tos_accepted: string;
  balance: number;
  theme: string;
  locale: string;
}

// 2. Response wrapper
export interface AccountResponse {
  success?: string;
  message?: string;
  error?: string;
  account: AccountDto;
}

export interface LoginResponse {
  success?: string;
  message?: string;
  error?: string;
}

export interface UserSearchResultDto {
  user_id: string;
  username: string;
}

export interface UsersSearchResponse {
  success?: string;
  message?: string;
  error?: string;
  users: UserSearchResultDto[];
}

// 3. Domain classes
export class Account {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  lastLogin: Date;
  tosAccepted: Date;
  balance: number;
  theme: string;
  locale: string;

  constructor(dto: AccountDto) {
    this.id = dto.id_;
    this.username = dto.username;
    this.email = dto.email;
    this.createdAt = parseBackendDate(dto.created_at);
    this.lastLogin = parseBackendDate(dto.last_login);
    this.tosAccepted = parseBackendDate(dto.tos_accepted);
    this.balance = dto.balance;
    this.theme = dto.theme;
    this.locale = dto.locale;
  }
}

export class UserSearchResult {
  userId: string;
  username: string;

  constructor(dto: UserSearchResultDto) {
    this.userId = dto.user_id;
    this.username = dto.username;
  }
}