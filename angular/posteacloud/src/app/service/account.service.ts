import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { Account, AccountResponse, LoginResponse, UserSearchResult, UsersSearchResponse } from '../type/account';

@Injectable({
  providedIn: 'root',
})
export class AccountService {
  private readonly http = inject(HttpClient);

  private readonly account$ = new BehaviorSubject<Account | null>(null);

  getAccountState(): BehaviorSubject<Account | null> {
    return this.account$;
  }

  login(email: string, password: string, totp: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/v1/login', { email, password, totp });
  }

  logout(): Observable<LoginResponse> {
    return this.http.get<LoginResponse>('/api/v1/logout').pipe(
      tap(() => this.account$.next(null)),
    );
  }

  update(): Observable<Account | null> {
    return this.http.get<AccountResponse>('/api/v1/account').pipe(
      map((res) => new Account(res.account)),
      tap((account) => this.account$.next(account)),
    );
  }

  searchUsers(username: string): Observable<UserSearchResult[]> {
    return this.http
      .get<UsersSearchResponse>('/api/v1/users', { params: { username } })
      .pipe(map((res) => res.users.map((u) => new UserSearchResult(u))));
  }
}