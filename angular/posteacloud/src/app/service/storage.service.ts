import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Entry, EntriesResponse, EntryDto, EntryResponse, PathResponse } from '../type/entry';
import { Partition, PartitionDto, PartitionResponse, PartitionsResponse } from '../type/partition';
import { Share, ShareCreatedResponse, SharesResponse } from '../type/share';
import { Usage, UsageResponse } from '../type/usage';

export interface PathItem {
  isPartition: boolean;
  partition?: Partition;
  entry?: Entry;
}

export interface SimpleResponse {
  success?: string;
  message?: string;
  error?: string;
}

export interface BatchUploadError {
  file: string;
  error: string;
}

export interface BatchUploadResponse {
  success?: string;
  message?: string;
  error?: string;
  entries: EntryDto[];
  upload_errors?: BatchUploadError[];
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private readonly http = inject(HttpClient);

  // --- Partitions ---------------------------------------------------------

  getPartitions(): Observable<Partition[]> {
    return this.http
      .get<PartitionsResponse>('/api/v1/partitions')
      .pipe(map((res) => res.partitions.map((p) => new Partition(p))));
  }

  getPartition(partitionId: string): Observable<Partition> {
    return this.http
      .get<PartitionResponse>(`/api/v1/partitions/${partitionId}`)
      .pipe(map((res) => new Partition(res.partition)));
  }

  deletePartition(partitionId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/partitions/${partitionId}`);
  }

  // --- Entries — listing ---------------------------------------------------

  getPartitionEntries(partitionId: string): Observable<Entry[]> {
    return this.http
      .get<EntriesResponse>(`/api/v1/partitions/${partitionId}/entries`)
      .pipe(map((res) => res.entries.map((e) => new Entry(e))));
  }

  getEntryChildren(entryId: string): Observable<Entry[]> {
    return this.http
      .get<EntriesResponse>(`/api/v1/entries/${entryId}/children`)
      .pipe(map((res) => res.entries.map((e) => new Entry(e))));
  }

  getEntry(entryId: string): Observable<Entry> {
    return this.http
      .get<EntryResponse>(`/api/v1/entries/${entryId}`)
      .pipe(map((res) => new Entry(res.entry)));
  }

  getEntryPath(entryId: string): Observable<PathItem[]> {
    return this.http.get<PathResponse>(`/api/v1/entries/${entryId}/path`).pipe(
      map((res) =>
        res.path.map((item) => {
          const record = item as Record<string, unknown>;
          if ('type_' in record) {
            return { isPartition: false, entry: new Entry(record as unknown as EntryDto) };
          }
          return { isPartition: true, partition: new Partition(record as unknown as PartitionDto) };
        }),
      ),
    );
  }

  // --- Entries — creation ---------------------------------------------------

  createFolder(name: string, partitionId: string, parentId: string | null): Observable<Entry> {
    return this.http
      .post<EntryResponse>('/api/v1/entries', {
        type_: 'folder',
        name,
        partition_id: partitionId,
        parent_id: parentId,
      })
      .pipe(map((res) => new Entry(res.entry)));
  }

  createLink(
    name: string,
    partitionId: string,
    parentId: string | null,
    targetId: string | null,
    targetPartitionId: string | null,
  ): Observable<Entry> {
    return this.http
      .post<EntryResponse>('/api/v1/entries', {
        type_: 'link',
        name,
        partition_id: partitionId,
        parent_id: parentId,
        target_id: targetId,
        target_partition_id: targetPartitionId,
      })
      .pipe(map((res) => new Entry(res.entry)));
  }

  uploadFile(parentOrPartitionId: string, file: File): Observable<Entry> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<EntryResponse>(`/api/v1/entries/${parentOrPartitionId}/upload`, formData)
      .pipe(map((res) => new Entry(res.entry)));
  }

  uploadBatch(
    parentOrPartitionId: string,
    files: File[],
    relativePaths: string[],
  ): Observable<BatchUploadResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file, file.name);
    }
    for (const rp of relativePaths) {
      formData.append('relative_paths', rp);
    }
    return this.http.post<BatchUploadResponse>(
      `/api/v1/entries/${parentOrPartitionId}/upload-batch`,
      formData,
    );
  }

  // --- Entries — download ---------------------------------------------------

  downloadEntry(entryId: string): Observable<Blob> {
    return this.http.get(`/api/v1/entries/${entryId}/download`, { responseType: 'blob' });
  }

  // --- Entries — update -------------------------------------------------

  renameEntry(entryId: string, name: string): Observable<Entry> {
    return this.http
      .put<EntryResponse>(`/api/v1/entries/${entryId}`, { name })
      .pipe(map((res) => new Entry(res.entry)));
  }

  moveEntry(entryId: string, parentId: string | null): Observable<Entry> {
    return this.http
      .put<EntryResponse>(`/api/v1/entries/${entryId}`, { parent_id: parentId })
      .pipe(map((res) => new Entry(res.entry)));
  }

  // --- Entries — delete / restore -------------------------------------------

  deleteEntry(entryId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/entries/${entryId}`);
  }

  restoreEntry(entryId: string): Observable<Entry> {
    return this.http
      .post<EntryResponse>(`/api/v1/entries/${entryId}/restore`, {})
      .pipe(map((res) => new Entry(res.entry)));
  }

  // --- Trash ---------------------------------------------------------------

  getTrash(): Observable<Entry[]> {
    return this.http
      .get<EntriesResponse>('/api/v1/trash')
      .pipe(map((res) => res.entries.map((e) => new Entry(e))));
  }

  // --- Sharing — partitions --------------------------------------------------

  getPartitionShares(partitionId: string): Observable<Share[]> {
    return this.http
      .get<SharesResponse>(`/api/v1/partitions/${partitionId}/share`)
      .pipe(map((res) => res.shares.map((s) => new Share(s))));
  }

  sharePartition(partitionId: string, userId: string, allowWrite: boolean): Observable<string> {
    return this.http
      .post<ShareCreatedResponse>(`/api/v1/partitions/${partitionId}/share`, {
        user_id: userId,
        allow_write: allowWrite ? 1 : 0,
      })
      .pipe(map((res) => res.share_id));
  }

  revokePartitionShare(partitionId: string, userId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/partitions/${partitionId}/share/${userId}`);
  }

  // --- Sharing — entries --------------------------------------------------

  getEntryShares(entryId: string): Observable<Share[]> {
    return this.http
      .get<SharesResponse>(`/api/v1/entries/${entryId}/share`)
      .pipe(map((res) => res.shares.map((s) => new Share(s))));
  }

  shareEntry(entryId: string, userId: string, allowWrite: boolean): Observable<string> {
    return this.http
      .post<ShareCreatedResponse>(`/api/v1/entries/${entryId}/share`, {
        user_id: userId,
        allow_write: allowWrite ? 1 : 0,
      })
      .pipe(map((res) => res.share_id));
  }

  revokeEntryShare(entryId: string, userId: string): Observable<SimpleResponse> {
    return this.http.delete<SimpleResponse>(`/api/v1/entries/${entryId}/share/${userId}`);
  }

  // --- Shared with me --------------------------------------------------

  getShared(): Observable<{ partitions: Partition[]; entries: Entry[] }> {
    return this.http
      .get<{
        partitions: PartitionDto[];
        entries: EntryDto[];
      }>('/api/v1/shared')
      .pipe(
        map((res) => ({
          partitions: res.partitions.map((p) => new Partition(p)),
          entries: res.entries.map((e) => new Entry(e)),
        })),
      );
  }

  // --- Search ----------------------------------------------------------

  search(q: string, partitionId?: string): Observable<Entry[]> {
    const params: Record<string, string> = { q };
    if (partitionId) {
      params['partition_id'] = partitionId;
    }
    return this.http
      .get<EntriesResponse>('/api/v1/search', { params })
      .pipe(map((res) => res.entries.map((e) => new Entry(e))));
  }

  // --- Recent ------------------------------------------------------------

  getRecent(): Observable<Entry[]> {
    return this.http
      .get<EntriesResponse>('/api/v1/recent')
      .pipe(map((res) => res.entries.map((e) => new Entry(e))));
  }

  // --- Usage ---------------------------------------------------------------

  getUsage(): Observable<Usage> {
    return this.http.get<UsageResponse>('/api/v1/usage').pipe(map((res) => new Usage(res)));
  }
}