import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AccountDto } from '../type/account';
import { Account } from '../type/account';
import { AdminUsage, AdminUsageResponse } from '../type/admin-usage';
import { Drive, DriveResponse, DrivesResponse } from '../type/drive';
import { IpScore, IpScoreResponse, IpScoresResponse } from '../type/ip-score';
import { Partition, PartitionDto, PartitionResponse, PartitionsResponse } from '../type/partition';
import { SimpleResponse } from './storage.service';

export interface AccountsResponse {
  success?: string;
  message?: string;
  error?: string;
  accounts: AccountDto[];
}

export interface NewAccountPayload {
  username: string;
  email: string;
  salt: string;
  hash: string;
  totp: string;
  balance?: number;
  theme?: string;
  locale?: string;
}

export interface HashPasswordResponse {
  success?: string;
  salt: string;
  hash: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly http = inject(HttpClient);

  // --- Password hashing helper (public endpoint) ---------------------------

  hashPassword(password: string): Observable<HashPasswordResponse> {
    return this.http.post<HashPasswordResponse>('/api/v1/hash_password', { password });
  }

  // --- Drives ----------------------------------------------------------------

  getDrives(): Observable<Drive[]> {
    return this.http
      .get<DrivesResponse>('/api/v1/admin/drives')
      .pipe(map((res) => res.drives.map((d) => new Drive(d))));
  }

  createDrive(name: string, location: string, description: string): Observable<Drive> {
    return this.http
      .post<DriveResponse>('/api/v1/admin/drives', { name, location, description })
      .pipe(map((res) => new Drive(res.drive)));
  }

  updateDrive(
    driveId: string,
    changes: Partial<{ name: string; location: string; description: string }>,
  ): Observable<Drive> {
    return this.http
      .put<DriveResponse>(`/api/v1/admin/drives/${driveId}`, changes)
      .pipe(map((res) => new Drive(res.drive)));
  }

  deleteDrive(driveId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/admin/drives/${driveId}`);
  }

  // --- Partitions --------------------------------------------------------------

  getPartitions(includeDeleted = false): Observable<Partition[]> {
    return this.http
      .get<PartitionsResponse>('/api/v1/admin/partitions', {
        params: { include_deleted: includeDeleted ? '1' : '0' },
      })
      .pipe(map((res) => res.partitions.map((p) => new Partition(p as PartitionDto))));
  }

  createPartition(
    name: string,
    driveId: string,
    ownerId: string,
    capacity: number,
    hidden: boolean,
  ): Observable<Partition> {
    return this.http
      .post<PartitionResponse>('/api/v1/admin/partitions', {
        name,
        drive_id: driveId,
        owner_id: ownerId,
        capacity,
        hidden: hidden ? 1 : 0,
      })
      .pipe(map((res) => new Partition(res.partition as PartitionDto)));
  }

  updatePartition(
    partitionId: string,
    changes: Partial<{
      name: string;
      drive_id: string;
      owner_id: string;
      capacity: number;
      hidden: boolean;
      deleted: string | null;
    }>,
  ): Observable<Partition> {
    return this.http
      .put<PartitionResponse>(`/api/v1/admin/partitions/${partitionId}`, changes)
      .pipe(map((res) => new Partition(res.partition as PartitionDto)));
  }

  deletePartition(partitionId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/admin/partitions/${partitionId}`);
  }

  // --- Accounts --------------------------------------------------------------

  getAccounts(): Observable<Account[]> {
    return this.http
      .get<AccountsResponse>('/api/v1/admin/accounts')
      .pipe(map((res) => res.accounts.map((a) => new Account(a))));
  }

  createAccount(payload: NewAccountPayload): Observable<Account> {
    return this.http
      .post<{ account: AccountDto }>('/api/v1/admin/accounts', payload)
      .pipe(map((res) => new Account(res.account)));
  }

  updateAccount(
    userId: string,
    changes: Partial<{
      username: string;
      email: string;
      balance: number;
      theme: string;
      locale: string;
      totp: string;
    }>,
  ): Observable<Account> {
    return this.http
      .put<{ account: AccountDto }>(`/api/v1/admin/accounts/${userId}`, changes)
      .pipe(map((res) => new Account(res.account)));
  }

  resetPassword(userId: string, salt: string, hash: string): Observable<SimpleResponse> {
    return this.http.put<SimpleResponse>(`/api/v1/admin/accounts/${userId}/password`, {
      salt,
      hash,
    });
  }

  deleteAccount(userId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/admin/accounts/${userId}`);
  }

  // --- Usage ---------------------------------------------------------------

  getUsage(): Observable<AdminUsage> {
    return this.http
      .get<AdminUsageResponse>('/api/v1/admin/usage')
      .pipe(map((res) => new AdminUsage(res)));
  }

  // --- IP score table --------------------------------------------------------

  getIps(): Observable<IpScore[]> {
    return this.http
      .get<IpScoresResponse>('/api/v1/admin/ips')
      .pipe(map((res) => res.ips.map((i) => new IpScore(i))));
  }

  createIp(ip: string, score: number, description: string): Observable<IpScore> {
    return this.http
      .post<IpScoreResponse>('/api/v1/admin/ips', { ip, score, description })
      .pipe(map((res) => new IpScore(res.ip)));
  }

  updateIp(
    ip: string,
    changes: Partial<{ score: number; description: string }>,
  ): Observable<IpScore> {
    return this.http
      .put<IpScoreResponse>(`/api/v1/admin/ips/${ip}`, changes)
      .pipe(map((res) => new IpScore(res.ip)));
  }

  deleteIp(ip: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/admin/ips/${ip}`);
  }
}