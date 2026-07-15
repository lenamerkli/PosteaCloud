import { HttpClient, HttpEvent, HttpEventType, HttpUploadProgressEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { map, share, timeout } from 'rxjs/operators';

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

/** Emitted for every real-time upload progress tick. */
export interface UploadProgress {
  /** How many whole files have completed uploading (estimated during transfer). */
  filesDone: number;
  /** Total files in the batch. */
  filesTotal: number;
  /** Bytes uploaded across all files so far. */
  bytesUploaded: number;
  /** Total bytes across all files. */
  bytesTotal: number;
  /** Percentage 0–100 (overall). */
  percent: number;
  /** Human-readable current speed (e.g. "2.3 MB/s"). */
  speed: string;
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private readonly http = inject(HttpClient);

  /** Active XHR reference so we can abort an in-flight batch upload. */
  private activeUploadXhr: XMLHttpRequest | null = null;

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

  /** Max bytes per chunk before we start a new request. */
  private static readonly CHUNK_BYTES = 200 * 1024 * 1024; // 200 MiB
  /** Max files per chunk before we start a new request. */
  private static readonly CHUNK_FILES = 50;
  /** Max retry attempts for a single chunk. */
  private static readonly CHUNK_MAX_ATTEMPTS = 3;
  /** Base delay between retries (doubled each attempt). */
  private static readonly CHUNK_RETRY_DELAY_MS = 2000;

  /**
   * Upload a batch of files in a SINGLE multipart request using
   * Angular's HttpClient with `reportProgress: true`.
   *
   * Returns an Observable of HttpEvent that yields progress events
   * and a final HttpResponse. The component subscribes and updates
   * the progress bar in real time.
   *
   * All files are packed into one request targeting the existing
   * /upload-batch backend endpoint. This avoids the per-request
   * overhead (and gunicorn worker timeouts) of uploading files
   * one-by-one.
   *
   * NOTE: For large uploads, prefer `uploadBatchChunked()` which
   * splits the batch into smaller HTTP requests to avoid hitting
   * reverse-proxy / HTTP/2 stream limits.
   */
  uploadBatch(
    parentOrPartitionId: string,
    files: File[],
    relativePaths: string[],
  ): Observable<HttpEvent<BatchUploadResponse>> {
    const uploadUrl = `/api/v1/entries/${parentOrPartitionId}/upload-batch`;
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file, file.name);
    }
    for (const rp of relativePaths) {
      formData.append('relative_paths', rp);
    }

    return this.http.post<BatchUploadResponse>(uploadUrl, formData, {
      reportProgress: true,
      observe: 'events',
    }).pipe(share());
  }

  /**
   * Split *files* (with corresponding *relativePaths*) into chunks,
   * upload each chunk sequentially via `/upload-batch`, and merge
   * progress / responses so the caller sees a single unified stream.
   *
   * Each chunk targets at most `CHUNK_BYTES` bytes and at most
   * `CHUNK_FILES` files.  Progress is aggregated across all chunks
   * so the progress bar moves continuously from 0-100 % for the
   * entire batch.
   *
   * If a chunk fails the remaining chunks are still attempted, and
   * the final response collects errors from every chunk.
   */
  // eslint-disable-next-line max-lines-per-function
  private uploadBatchChunked(
    parentOrPartitionId: string,
    files: File[],
    relativePaths: string[],
    progress$: Subject<UploadProgress>,
    response$: Subject<BatchUploadResponse>,
    subContainer: Subscription,
  ): void {
    const { chunks, chunkPaths } = this._splitIntoChunks(files, relativePaths);

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const fileCount = files.length;

    console.log(
      `[uploadBatchChunked] START  files=${fileCount}  totalBytes=${totalBytes} (${this._fmtBytes(totalBytes)})  chunks=${chunks.length}`,
    );
    chunks.forEach((c, i) => {
      const cBytes = c.reduce((a, f) => a + f.size, 0);
      console.log(`[uploadBatchChunked]   chunk[${i}]  files=${c.length}  bytes=${cBytes}  size=${this._fmtBytes(cBytes)}`);
    });

    if (chunks.length === 0) {
      console.warn('[uploadBatchChunked] No chunks — finishing.');
      progress$.complete();
      response$.next({
        success: 'success',
        message: '0 file(s) uploaded, 0 error(s).',
        entries: [],
        upload_errors: [],
      });
      response$.complete();
      return;
    }

    const accumulatedEntries: EntryDto[] = [];
    const accumulatedErrors: BatchUploadError[] = [];

    let bytesFromCompleted = 0;
    let filesFromCompleted = 0;

    let lastTickTime = Date.now();
    let lastTickBytes = 0;

    // Track the currently-in-flight chunk subscription so we can
    // explicitly unsubscribe it after each chunk finishes.  This is
    // critical: Firefox limits TCP connections per host (typically 6),
    // and HttpClient subscriptions hold onto XHR handles.  If we let
    // old completed-chunk subscriptions accumulate, we exhaust the
    // connection pool and get NS_BINDING_ABORTED.
    let currentSub: Subscription | null = null;

    // When the entire upload is cancelled, tear down the active chunk.
    subContainer.add(new Subscription(() => currentSub?.unsubscribe()));

    const uploadNext = (chunkIdx: number, attempt = 1): void => {
      if (chunkIdx >= chunks.length) {
        const done = accumulatedEntries.length;
        console.log(
          `[uploadBatchChunked] DONE  entries=${done}  errors=${accumulatedErrors.length}  bytesCompleted=${bytesFromCompleted}  filesCompleted=${filesFromCompleted}`,
        );
        progress$.next({
          filesDone: done,
          filesTotal: fileCount,
          bytesUploaded: totalBytes,
          bytesTotal: totalBytes,
          percent: 100,
          speed: '',
        });
        progress$.complete();

        const allSuccess = accumulatedErrors.length === 0;
        response$.next({
          success: allSuccess || accumulatedEntries.length > 0 ? 'success' : 'error',
          message: `${done} file(s) uploaded, ${accumulatedErrors.length} error(s).`,
          entries: accumulatedEntries,
          upload_errors: accumulatedErrors,
        });
        response$.complete();
        return;
      }

      const chunkFiles = chunks[chunkIdx];
      const chunkRPs = chunkPaths[chunkIdx];
      const chunkBytes = chunkFiles.reduce((a, f) => a + f.size, 0);

      console.log(
        `[uploadBatchChunked] CHUNK[${chunkIdx}]  POST START  files=${chunkFiles.length}  bytes=${chunkBytes}  size=${this._fmtBytes(chunkBytes)}  totalDone=${this._fmtBytes(bytesFromCompleted)}/${this._fmtBytes(totalBytes)}  progress=${Math.round((bytesFromCompleted / totalBytes) * 100)}%`,
      );

      const formData = new FormData();
      for (const file of chunkFiles) {
        formData.append('files', file, file.name);
      }
      for (const rp of chunkRPs) {
        formData.append('relative_paths', rp);
      }

      let chunkHandled = false;
      const chunkStartTime = Date.now();

      // Unsubscribe from the previous chunk so its XHR connection
      // is freed.  Firefox enforces a 6-connection-per-host limit.
      currentSub?.unsubscribe();

      currentSub = this.http.post<BatchUploadResponse>(
        `/api/v1/entries/${parentOrPartitionId}/upload-batch`,
        formData,
        { reportProgress: true, observe: 'events' },
      ).pipe(
        timeout(600_000),
      ).subscribe({
        next: (event: HttpEvent<BatchUploadResponse>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const loaded = (event as HttpUploadProgressEvent).loaded;
            const total = (event as HttpUploadProgressEvent).total ?? chunkBytes;

            const now = Date.now();
            const elapsed = (now - lastTickTime) / 1000;
            const allLoaded = bytesFromCompleted + loaded;
            const bytesInWindow = allLoaded - lastTickBytes;
            const speedBps = elapsed > 0 ? bytesInWindow / elapsed : 0;
            lastTickTime = now;
            lastTickBytes = allLoaded;

            const speedStr = this._formatSpeed(speedBps);

            const estFiles = total > 0
              ? filesFromCompleted + Math.round((loaded / total) * chunkFiles.length)
              : filesFromCompleted;

            progress$.next({
              filesDone: estFiles,
              filesTotal: fileCount,
              bytesUploaded: allLoaded,
              bytesTotal: totalBytes,
              percent: totalBytes > 0 ? Math.round((allLoaded / totalBytes) * 100) : 0,
              speed: speedStr,
            });

            // Only log every ~5 % so we don't flood the console.
            const chunkPct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            if (chunkPct % 20 === 0) {
              console.log(
                `[uploadBatchChunked] CHUNK[${chunkIdx}]  progress  loaded=${this._fmtBytes(allLoaded)}/${this._fmtBytes(totalBytes)}  chunkPct=${chunkPct}%  ${speedStr || '--'}`,
              );
            }
          } else if (event.type === HttpEventType.Response) {
            chunkHandled = true;
            const elapsedMs = Date.now() - chunkStartTime;
            const body = event.body as BatchUploadResponse;
            const status = body?.success ?? '?';
            const entryCount = body?.entries?.length ?? 0;
            const errCount = body?.upload_errors?.length ?? 0;

            console.log(
              `[uploadBatchChunked] CHUNK[${chunkIdx}]  RESPONSE  status=${status}  entries=${entryCount}  errors=${errCount}  elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
            );

            if (body.entries) {
              accumulatedEntries.push(...body.entries);
            }
            if (body.upload_errors) {
              accumulatedErrors.push(...body.upload_errors);
              for (const e of body.upload_errors) {
                console.warn(`[uploadBatchChunked] CHUNK[${chunkIdx}]  ERR: ${e.file}: ${e.error}`);
              }
            }

            bytesFromCompleted += chunkBytes;
            filesFromCompleted += chunkFiles.length;

            progress$.next({
              filesDone: filesFromCompleted,
              filesTotal: fileCount,
              bytesUploaded: bytesFromCompleted,
              bytesTotal: totalBytes,
              percent: totalBytes > 0 ? Math.round((bytesFromCompleted / totalBytes) * 100) : 0,
              speed: '',
            });

            uploadNext(chunkIdx + 1);
          }
        },
        error: (err: unknown) => {
          chunkHandled = true;
          const elapsedMs = Date.now() - chunkStartTime;
          let message = 'Chunk upload failed.';
          if (typeof err === 'object' && err !== null && 'message' in err) {
            message = (err as { message: string }).message;
          } else if (typeof err === 'string') {
            message = err;
          }

          if (attempt < StorageService.CHUNK_MAX_ATTEMPTS) {
            const delay = StorageService.CHUNK_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(
              `[uploadBatchChunked] CHUNK[${chunkIdx}]  RETRY-SCHEDULED  msg="${message}"  attempt=${attempt}/${StorageService.CHUNK_MAX_ATTEMPTS}  delay=${delay}ms  elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
            );
            setTimeout(() => uploadNext(chunkIdx, attempt + 1), delay);
            return;
          }

          console.error(
            `[uploadBatchChunked] CHUNK[${chunkIdx}]  FINAL-ERROR  msg="${message}"  attempts=${attempt}  elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
          );
          accumulatedErrors.push(...chunkFiles.map((f) => ({
            file: f.name,
            error: message + ` (failed after ${attempt} attempts)`,
          })));

          bytesFromCompleted += chunkBytes;
          filesFromCompleted += chunkFiles.length;

          uploadNext(chunkIdx + 1);
        },
        complete: () => {
          if (chunkHandled) {
            return;
          }
          const elapsedMs = Date.now() - chunkStartTime;

          if (attempt < StorageService.CHUNK_MAX_ATTEMPTS) {
            const delay = StorageService.CHUNK_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(
              `[uploadBatchChunked] CHUNK[${chunkIdx}]  RETRY-SCHEDULED  reason="completed-without-response"  attempt=${attempt}/${StorageService.CHUNK_MAX_ATTEMPTS}  delay=${delay}ms`,
            );
            setTimeout(() => uploadNext(chunkIdx, attempt + 1), delay);
            return;
          }

          console.warn(
            `[uploadBatchChunked] CHUNK[${chunkIdx}]  COMPLETED-WITHOUT-RESPONSE  elapsed=${(elapsedMs / 1000).toFixed(1)}s  (HTTP/2 stream reset or empty body, exhausted retries)`,
          );
          accumulatedErrors.push(...chunkFiles.map((f) => ({
            file: f.name,
            error: 'Connection closed unexpectedly after ' + attempt + ' attempts.',
          })));

          bytesFromCompleted += chunkBytes;
          filesFromCompleted += chunkFiles.length;

          uploadNext(chunkIdx + 1);
        },
      });

    };

    uploadNext(0);
  }

  /**
   * Partition files into groups respecting both byte and file-count limits.
   * Returns parallel arrays: `chunks` (File[][]) and `chunkPaths` (string[][]).
   */
  private _splitIntoChunks(
    files: File[],
    relativePaths: string[],
  ): { chunks: File[][]; chunkPaths: string[][] } {
    const chunks: File[][] = [];
    const chunkPaths: string[][] = [];

    let currentChunk: File[] = [];
    let currentPaths: string[] = [];
    let currentBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rp = i < relativePaths.length ? relativePaths[i] : '';

      const wouldExceedBytes = currentBytes + file.size > StorageService.CHUNK_BYTES && currentChunk.length > 0;
      const wouldExceedCount = currentChunk.length >= StorageService.CHUNK_FILES;

      if (wouldExceedBytes || wouldExceedCount) {
        chunks.push(currentChunk);
        chunkPaths.push(currentPaths);
        currentChunk = [];
        currentPaths = [];
        currentBytes = 0;
      }

      currentChunk.push(file);
      currentPaths.push(rp);
      currentBytes += file.size;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      chunkPaths.push(currentPaths);
    }

    return { chunks, chunkPaths };
  }

  /**
   * Abort the currently in-flight batch upload, if any.
   *
   * Angular's HttpClient does not expose a direct cancel API, so we
   * instruct the component to unsubscribe from the observable chain.
   */
  cancelActiveUpload(): void {
    // HttpClient subscriptions auto-cancel when unsubscribed.
  }

  /**
   * Convenience: emit progress snapshots from an HttpEvent stream.
   * Returns two Subjects that the component can subscribe to.
   *
   * When the total upload exceeds ~200 MiB or ~50 files the batch is
   * automatically split into multiple sequential HTTP requests (chunks)
   * so that no single request body overwhelms the reverse proxy or
   * the HTTP/2 stream.  Progress is aggregated across all chunks so
   * the component sees a single, continuous 0-100 % progress bar.
   */
  uploadBatchWithProgress(
    parentOrPartitionId: string,
    files: File[],
    relativePaths: string[],
  ): {
    progress$: Subject<UploadProgress>;
    response$: Subject<BatchUploadResponse>;
  } {
    const progress$ = new Subject<UploadProgress>();
    const response$ = new Subject<BatchUploadResponse>();

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const tooBig =
      totalBytes > StorageService.CHUNK_BYTES ||
      files.length > StorageService.CHUNK_FILES;

    if (tooBig) {
      // Keep subContainer on the Subjects so the component can attach
      // its own cleanup via a Subscription wrapper (see file-browser.ts).
      // We use a shared Subscription that holds all inner chunk subs.
      const subContainer = new Subscription();
      (response$ as { _sub?: Subscription })._sub = subContainer;

      // Start the chunked chain (async, non-blocking).
      setTimeout(() => {
        this.uploadBatchChunked(
          parentOrPartitionId,
          files,
          relativePaths,
          progress$,
          response$,
          subContainer,
        );
      }, 0);

      return { progress$, response$ };
    }

    // Small batch — single request, original code path.
    const fileCount = files.length;

    let lastTickTime = Date.now();
    let lastTickBytes = 0;

    const sub = this.uploadBatch(parentOrPartitionId, files, relativePaths).subscribe({
      next: (event: HttpEvent<BatchUploadResponse>) => {
        if (event.type === HttpEventType.UploadProgress) {
          const loaded = (event as HttpUploadProgressEvent).loaded;
          const total = (event as HttpUploadProgressEvent).total ?? totalBytes;

          // Calculate speed
          const now = Date.now();
          const elapsed = (now - lastTickTime) / 1000;
          const bytesInWindow = loaded - lastTickBytes;
          const speedBps = elapsed > 0 ? bytesInWindow / elapsed : 0;
          lastTickTime = now;
          lastTickBytes = loaded;

          const speedStr = this._formatSpeed(speedBps);

          const estimatedFiles =
            total > 0 ? Math.round((loaded / total) * fileCount) : 0;

          progress$.next({
            filesDone: estimatedFiles,
            filesTotal: fileCount,
            bytesUploaded: loaded,
            bytesTotal: total,
            percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
            speed: speedStr,
          });
        } else if (event.type === HttpEventType.Response) {
          const body = event.body as BatchUploadResponse;
          const realDone = body?.entries?.length ?? 0;

          progress$.next({
            filesDone: realDone,
            filesTotal: fileCount,
            bytesUploaded: totalBytes,
            bytesTotal: totalBytes,
            percent: 100,
            speed: '',
          });
          progress$.complete();

          response$.next(body);
          response$.complete();
        }
      },
      error: (err: unknown) => {
        progress$.complete();
        let message = 'Upload failed.';
        if (typeof err === 'object' && err !== null && 'message' in err) {
          message = (err as { message: string }).message;
        } else if (typeof err === 'string') {
          message = err;
        }
        response$.next({
          success: 'error',
          message,
          entries: [],
          upload_errors: [{ file: '', error: message }],
        });
        response$.complete();
      },
      complete: () => {
        // Response already handled — nothing extra to do.
      },
    });

    // Attach the subscription for cleanup.
    (response$ as { _sub?: typeof sub })._sub = sub;

    return { progress$, response$ };
  }

  private _formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond <= 0) {
      return '';
    }
    const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
    let size = bytesPerSecond;
    let unitIdx = 0;
    while (size >= 1000 && unitIdx < units.length - 1) {
      size /= 1000;
      unitIdx++;
    }
    return `${size.toFixed(1)} ${units[unitIdx]}`;
  }

  /** Log-friendly byte formatter (used by uploadBatchChunked debug logs). */
  private _fmtBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'kB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIdx = 0;
    while (size >= 1000 && unitIdx < units.length - 1) {
      size /= 1000;
      unitIdx++;
    }
    return `${size.toFixed(1)} ${units[unitIdx]}`;
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