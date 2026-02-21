from datetime import datetime
from hashlib import sha3_256
from os import makedirs
from os.path import join, dirname
import subprocess
import typing as t

from ..main import query_db
from ...util.misc import DATE_FORMAT
from ...util.rand import rand_id

import drive as drive_module
import partition as partition_module
import user as user_module


class Entry:

    def __init__(
            self,
            id_: t.Union[str,None]=None,
            type_: str='',
            name: str='',
            parent_id: t.Union[str,None]=None,
            owner_id: str='',
            partition_id: str='',
            created: t.Union[datetime,str,None]=None,
            edited: t.Union[datetime,str,None]=None,
            viewed: t.Union[datetime,str,None]=None,
            deleted: t.Union[datetime,str,None]=None,
            hidden: t.Union[bool,int]=0,
            size: t.Union[int,None]=None,
            hash_: t.Union[str,None]=None,
            encrypted: t.Union[bool,int]=0,
            encryption_hash: t.Union[str,None]=None,
            target_id: t.Union[str,None]=None,
            target_partition_id: t.Union[str,None]=None,
    ):
        self._id = ''
        self._type = ''
        self._name = ''
        self._parent_id = ''
        self._owner_id = ''
        self._partition_id = ''
        self._created = ''
        self._edited = ''
        self._viewed = ''
        self._deleted = ''
        self._hidden = 0
        self._size = 0
        self._hash = ''
        self._encrypted = 0
        self._encryption_hash = ''
        self._target_id = ''
        self._target_partition_id = ''
        if id_ is None:
            id_ = rand_id('entry')
        if created is None:
            created = datetime.now()
        if edited is None:
            edited = datetime.now()
        if viewed is None:
            viewed = datetime.now()
        self.id_ = id_
        self.type_ = type_
        self.name = name
        self.parent_id = parent_id
        self.owner_id = owner_id
        self.partition_id = partition_id
        self.created = created
        self.edited = edited
        self.viewed = viewed
        self.deleted = deleted
        self.hidden = hidden
        self.size = size
        self.hash_ = hash_
        self.encrypted = encrypted
        self.encryption_hash = encryption_hash
        self.target_id = target_id
        self.target_partition_id = target_partition_id

    def __str__(self) -> str:
        return self.id_

    def __dict__(self) -> dict:
        return {
            'id_': self.id_,
            'type_': self.type_,
            'name': self.name,
            'parent_id': self.parent_id,
            'owner_id': self.owner_id,
            'partition_id': self.partition_id,
            'created': self.created,
            'edited': self.edited,
            'viewed': self.viewed,
            'deleted': self.deleted,
            'hidden': self.hidden,
            'size': self.size,
            'hash_': self.hash_,
            'encrypted': self.encrypted,
            'encryption_hash': self.encryption_hash,
            'target_id': self.target_id,
            'target_partition_id': self.target_partition_id,
        }

    def save(self) -> None:
        if not self._id:
            raise ValueError('Entry ID is not set')
        if not query_db('SELECT id FROM entries WHERE id=?', (self._id,), True):
            query_db(
                'INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (
                    self._id,
                    self._type,
                    self._name,
                    self._parent_id,
                    self._owner_id,
                    self._partition_id,
                    self._created,
                    self._edited,
                    self._viewed,
                    self._deleted,
                    self._hidden,
                    self._size,
                    self._hash,
                    self._encrypted,
                    self._encryption_hash,
                    self._target_id,
                    self._target_partition_id,
                )
            )
        else:
            query_db(
                'UPDATE entries SET type=?, name=?, parent_id=?, owner_id=?, partition_id=?, created=?, edited=?, viewed=?, deleted=?, hidden=?, size=?, hash=?, encrypted=?, encryption_hash=?, target_id=?, target_partition_id=? WHERE id=?',
                (
                    self._type,
                    self._name,
                    self._parent_id,
                    self._owner_id,
                    self._partition_id,
                    self._created,
                    self._edited,
                    self._viewed,
                    self._deleted,
                    self._hidden,
                    self._size,
                    self._hash,
                    self._encrypted,
                    self._encryption_hash,
                    self._target_id,
                    self._target_partition_id,
                    self._id,
                )
            )

    @classmethod
    def load(cls, id_: str) -> 'Entry':
        db_result = query_db(
            'SELECT id, type, name, parent_id, owner_id, partition_id, created, edited, viewed, deleted, hidden, size, hash, encrypted, encryption_hash, target_id, target_partition_id FROM entries WHERE id=?',
            (id_,),
            True
        )
        if not db_result:
            raise ValueError(f"No entry with id {id_} has been found.")
        return Entry(
            id_=db_result[0],
            type_=db_result[1],
            name=db_result[2],
            parent_id=db_result[3],
            owner_id=db_result[4],
            partition_id=db_result[5],
            created=db_result[6],
            edited=db_result[7],
            viewed=db_result[8],
            deleted=db_result[9],
            hidden=db_result[10],
            size=db_result[11],
            hash_=db_result[12],
            encrypted=db_result[13],
            encryption_hash=db_result[14],
            target_id=db_result[15],
            target_partition_id=db_result[16],
        )

    def to_json(self) -> dict:
        data = self.__dict__()
        data['created'] = data['created'].strftime(DATE_FORMAT)
        data['edited'] = data['edited'].strftime(DATE_FORMAT)
        data['viewed'] = data['viewed'].strftime(DATE_FORMAT)
        if data['deleted']:
            data['deleted'] = data['deleted'].strftime(DATE_FORMAT)
        return data

    @property
    def id_(self) -> str:
        return self._id

    @id_.setter
    def id_(self, value: str) -> None:
        self._id = value

    @property
    def type_(self) -> str:
        return self._type

    @type_.setter
    def type_(self, value: str) -> None:
        self._type = value

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._name = value

    @property
    def parent_id(self) -> t.Union[str,None]:
        return self._parent_id

    @parent_id.setter
    def parent_id(self, value: t.Union[str,None]) -> None:
        self._parent_id = value

    @property
    def owner_id(self) -> str:
        return self._owner_id

    @owner_id.setter
    def owner_id(self, value: str) -> None:
        self._owner_id = value

    @property
    def partition_id(self) -> str:
        return self._partition_id

    @partition_id.setter
    def partition_id(self, value: str) -> None:
        self._partition_id = value

    @property
    def created(self) -> datetime:
        return datetime.strptime(self._created, DATE_FORMAT)

    @created.setter
    def created(self, value: t.Union[datetime,str]) -> None:
        if isinstance(value, datetime):
            self._created = value.strftime(DATE_FORMAT)
        else:
            self._created = value

    @property
    def edited(self) -> datetime:
        return datetime.strptime(self._edited, DATE_FORMAT)

    @edited.setter
    def edited(self, value: t.Union[datetime,str]) -> None:
        if isinstance(value, datetime):
            self._edited = value.strftime(DATE_FORMAT)
        else:
            self._edited = value

    @property
    def viewed(self) -> datetime:
        return datetime.strptime(self._viewed, DATE_FORMAT)

    @viewed.setter
    def viewed(self, value: t.Union[datetime,str]) -> None:
        if isinstance(value, datetime):
            self._viewed = value.strftime(DATE_FORMAT)
        else:
            self._viewed = value

    @property
    def deleted(self) -> t.Union[datetime,None]:
        if self._deleted:
            return datetime.strptime(self._deleted, DATE_FORMAT)
        return None

    @deleted.setter
    def deleted(self, value: t.Union[datetime,str,None]) -> None:
        if value is None:
            self._deleted = None
        elif isinstance(value, datetime):
            self._deleted = value.strftime(DATE_FORMAT)
        else:
            self._deleted = value

    @property
    def hidden(self) -> bool:
        return bool(self._hidden)

    @hidden.setter
    def hidden(self, value: t.Union[bool,int]) -> None:
        self._hidden = int(value)

    @property
    def size(self) -> t.Union[int,None]:
        return self._size

    @size.setter
    def size(self, value: t.Union[int,None]) -> None:
        self._size = value

    @property
    def hash_(self) -> t.Union[str,None]:
        return self._hash

    @hash_.setter
    def hash_(self, value: t.Union[str,None]) -> None:
        self._hash = value

    @property
    def encrypted(self) -> t.Union[bool,None]:
        if self._encrypted in [0, 1]:
            return bool(self._encrypted)
        return None

    @encrypted.setter
    def encrypted(self, value: t.Union[bool,int]) -> None:
        self._encrypted = int(value)

    @property
    def encryption_hash(self) -> t.Union[str,None]:
        return self._encryption_hash

    @encryption_hash.setter
    def encryption_hash(self, value: t.Union[str,None]) -> None:
        self._encryption_hash = value

    @property
    def target_id(self) -> t.Union[str,None]:
        return self._target_id

    @target_id.setter
    def target_id(self, value: t.Union[str,None]) -> None:
        self._target_id = value

    @property
    def target_partition_id(self) -> t.Union[str,None]:
        return self._target_partition_id

    @target_partition_id.setter
    def target_partition_id(self, value: t.Union[str,None]) -> None:
        self._target_partition_id = value

    def get_partition(self) -> partition_module.Partition:
        return partition_module.Partition.load(self._partition_id)

    def get_owner(self) -> user_module.User:
        return user_module.User.load(self._owner_id)

    def get_parent(self) -> t.Union['Entry',partition_module.Partition]:
        if self._parent_id:
            return Entry.load(self._parent_id)
        return self.get_partition()

    def get_drive(self) -> drive_module.Drive:
        return self.get_partition().get_drive()

    def is_shared(self) -> bool:
        return bool(query_db('SELECT id FROM entry_shares WHERE entry_id=?', (self._id,), True))

    def can_user_access(self, user_id: str) -> bool:
        return (user_id == self._owner_id) or bool(query_db('SELECT id FROM entry_shares WHERE entry_id=? AND user_id=?', (self._id, user_id), True))

    def can_user_edit(self, user_id: str) -> bool:
        return (user_id == self._owner_id) or bool(query_db('SELECT id FROM entry_shares WHERE entry_id=? AND user_id=? AND allow_write=1', (self._id, user_id), True))

    def update_edited(self) -> None:
        self.edited = datetime.now()

    def update_viewed(self) -> None:
        self.viewed = datetime.now()

    def get_path(self) -> str:
        return join(self.get_drive().location, self._hash[:2], self._hash[2:4], self._hash[4:])

    def read(self) -> bytes:
        if self._type != 'file':
            raise ValueError('Entry is not a file')
        self.update_viewed()
        with open(self.get_path(), 'rb') as f:
            content = f.read()
        return content

    def write(self, content: bytes) -> None:
        if self._type != 'file':
            raise ValueError('Entry is not a file')
        self.update_edited()
        self.update_viewed()
        hash_ = sha3_256(content).hexdigest()
        self._hash = hash_
        self._size = len(content)
        path = join(self.get_drive().location, hash_[:2], hash_[2:4], hash_[4:])
        makedirs(dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(content)

    def alternate_write(self, path: str) -> None:
        if self._type != 'file':
            raise ValueError('Entry is not a file')
        self.update_edited()
        self.update_viewed()
        hash_result = subprocess.run(
            ['sha3_256sum', path],
            capture_output=True,
            text=True,
            check=True
        )
        hash_output = hash_result.stdout.strip()
        self._hash = hash_output.split('= ')[1]
        size_result = subprocess.run(
            ['stat', '--printf=%s', path],
            capture_output=True,
            text=True,
            check=True
        )
        self._size = int(size_result.stdout)
        dest_path = join(self.get_drive().location, self._hash[:2], self._hash[2:4], self._hash[4:])
        makedirs(dirname(dest_path), exist_ok=True)
        subprocess.run(['mv', path, dest_path], check=True)
