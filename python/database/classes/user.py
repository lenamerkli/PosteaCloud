from datetime import datetime
import typing as t

from ..main import query_db
from ...util.misc import DATE_FORMAT
from ...util.rand import rand_id

import partition as partition_module


class User:

    def __init__(
            self,
            id_: t.Union[str,None]=None,
            username: str='',
            email: str='',
            password: str='',
            salt: str='',
            totp: str='',
            created_at: t.Union[datetime,str,None]=None,
            last_login: t.Union[datetime,str,None]=None,
            tos_accepted: t.Union[datetime,str,None]=None,
            balance: int=0,
            theme: str='',
            locale: str='',
    ):
        self._id = ''
        self._username = ''
        self._email = ''
        self._password = ''
        self._salt = ''
        self._totp = ''
        self._created_at = ''
        self._last_login = ''
        self._tos_accepted = ''
        self._balance = 0
        self._theme = ''
        self._locale = ''
        if id_ is None:
            id_ = rand_id('user')
        if created_at is None:
            created_at = datetime.now()
        if last_login is None:
            last_login = datetime.now()
        if tos_accepted is None:
            tos_accepted = datetime.now()
        self.id_ = id_
        self.username = username
        self.email = email
        self.password = password
        self.salt = salt
        self.totp = totp
        self.created_at = created_at
        self.last_login = last_login
        self.tos_accepted = tos_accepted
        self.balance = balance
        self.theme = theme
        self.locale = locale

    def __str__(self) -> str:
        return self.id_

    def __dict__(self) -> dict:
        return {
            'id_': self.id_,
            'username': self.username,
            'email': self.email,
            'password': self.password,
            'salt': self.salt,
            'totp': self.totp,
            'created_at': self.created_at,
            'last_login': self.last_login,
            'tos_accepted': self.tos_accepted,
            'balance': self.balance,
            'theme': self.theme,
            'locale': self.locale,
        }

    def save(self) -> None:
        if not self._id:
            raise ValueError('User ID is not set')
        if not query_db('SELECT id FROM users WHERE id=?', (self._id,), True):
            query_db(
                'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (
                    self._id,
                    self._username,
                    self._email,
                    self._password,
                    self._salt,
                    self._totp,
                    self._created_at,
                    self._last_login,
                    self._tos_accepted,
                    self._balance,
                    self._theme,
                    self._locale,
                )
            )
        else:
            query_db(
                'UPDATE users SET username=?, email=?, password=?, salt=?, totp=?, created_at=?, last_login=?, tos_accepted=?, balance=?, theme=?, locale=? WHERE id=?',
                (
                    self._username,
                    self._email,
                    self._password,
                    self._salt,
                    self._totp,
                    self._created_at,
                    self._last_login,
                    self._tos_accepted,
                    self._balance,
                    self._theme,
                    self._locale,
                    self._id,
                )
            )

    @classmethod
    def load(cls, id_: str) -> 'User':
        db_result = query_db(
            'SELECT id, username, email, password, salt, totp, created_at, last_login, tos_accepted, balance, theme, locale FROM users WHERE id=?',
            (id_,),
            True
        )
        if not db_result:
            raise ValueError(f"No user with id {id_} has been found.")
        return User(
            id_=db_result[0],
            username=db_result[1],
            email=db_result[2],
            password=db_result[3],
            salt=db_result[4],
            totp=db_result[5],
            created_at=db_result[6],
            last_login=db_result[7],
            tos_accepted=db_result[8],
            balance=db_result[9],
            theme=db_result[10],
            locale=db_result[11],
        )

    def to_json(self) -> dict:
        data = self.__dict__()
        data['created_at'] = data['created_at'].strftime(DATE_FORMAT)
        data['last_login'] = data['last_login'].strftime(DATE_FORMAT)
        data['tos_accepted'] = data['tos_accepted'].strftime(DATE_FORMAT)
        return data

    @property
    def id_(self) -> str:
        return self._id

    @id_.setter
    def id_(self, value: str) -> None:
        self._id = value

    @property
    def username(self) -> str:
        return self._username

    @username.setter
    def username(self, value: str) -> None:
        self._username = value

    @property
    def email(self) -> str:
        return self._email

    @email.setter
    def email(self, value: str) -> None:
        self._email = value

    @property
    def password(self) -> str:
        return self._password

    @password.setter
    def password(self, value: str) -> None:
        self._password = value

    @property
    def salt(self) -> str:
        return self._salt

    @salt.setter
    def salt(self, value: str) -> None:
        self._salt = value

    @property
    def totp(self) -> str:
        return self._totp

    @totp.setter
    def totp(self, value: str) -> None:
        self._totp = value

    @property
    def created_at(self) -> datetime:
        return datetime.strptime(self._created_at, DATE_FORMAT)

    @created_at.setter
    def created_at(self, value: t.Union[datetime,str]) -> None:
        if isinstance(value, datetime):
            self._created_at = value.strftime(DATE_FORMAT)
        else:
            self._created_at = value

    @property
    def last_login(self) -> datetime:
        return datetime.strptime(self._last_login, DATE_FORMAT)

    @last_login.setter
    def last_login(self, value: t.Union[datetime,str]) -> None:
        if isinstance(value, datetime):
            self._last_login = value.strftime(DATE_FORMAT)
        else:
            self._last_login = value

    @property
    def tos_accepted(self) -> datetime:
        return datetime.strptime(self._tos_accepted, DATE_FORMAT)

    @tos_accepted.setter
    def tos_accepted(self, value: t.Union[datetime,str]) -> None:
        if isinstance(value, datetime):
            self._tos_accepted = value.strftime(DATE_FORMAT)
        else:
            self._tos_accepted = value

    @property
    def balance(self) -> int:
        return self._balance

    @balance.setter
    def balance(self, value: int) -> None:
        self._balance = value

    @property
    def theme(self) -> str:
        return self._theme

    @theme.setter
    def theme(self, value: str) -> None:
        self._theme = value

    @property
    def locale(self) -> str:
        return self._locale

    @locale.setter
    def locale(self, value: str) -> None:
        self._locale = value

    def get_own_partitions(self) -> t.List[partition_module.Partition]:
        result = query_db('SELECT id FROM partitions WHERE owner_id=?', (self.id_,))
        return [partition_module.Partition.load(row[0]) for row in result]

    def get_accessible_partitions(self) -> t.List[partition_module.Partition]:
        own_partitions = self.get_own_partitions()
        result = query_db('SELECT partition_id FROM partition_shares WHERE user_id=?', (self.id_,))
        return own_partitions + [partition_module.Partition.load(row[0]) for row in result]
