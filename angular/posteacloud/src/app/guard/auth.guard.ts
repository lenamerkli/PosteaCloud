import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';

import { AccountService } from '../service/account.service';

export const authGuard: CanActivateFn = () => {
  const accountService = inject(AccountService);
  const router = inject(Router);

  const currentAccount = accountService.getAccountState().value;
  if (currentAccount) {
    return true;
  }

  return accountService.update().pipe(
    take(1),
    map((account) => (account ? true : router.createUrlTree(['/login']))),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};