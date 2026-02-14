from datetime import datetime
import typing as t

from ..main import query_db
from ...util.misc import DATE_FORMAT
from ...util.rand import rand_id


class Partition:

    def __init__(
            self,
            id_: t.Union[str,None]=None,
            drive_id: str='',
            name: str='',
            owner_id: str='',
            capacity: int=0,
            created: t.Union[datetime,str,None]=None,
            edited: t.Union[datetime,str,None]=None,
            viewed: t.Union[datetime,str,None]=None,
            deleted: t.Union[datetime,str,None]=None,
            hidden: t.Union[bool,int]=0,
    ):
        self._id = ''
        self._drive_id = ''
        self._name = ''
        self._owner_id = ''
        self._capacity = 0
        self._created = ''
        self._edited = ''
        self._viewed = ''
        self._deleted = ''
        self._hidden = 0
        if id_ is None:
            id_ = rand_id('partition')
        if created is None:
            created = datetime.now()
        if edited is None:
            edited = datetime.now()
        if viewed is None:
            viewed = datetime.now()
        self.id_ = id_
        self.drive_id = drive_id
        self.name = name
        self.owner_id = owner_id
        self.capacity = capacity
        self.created = created
        self.edited = edited
        self.viewed = viewed
        self.deleted = deleted
        self.hidden = hidden

    def __str__(self) -> str:
        return self.id_

    def __dict__(self) -> dict:
        return {
            'id_': self.id_,
            'drive_id': self.drive_id,
            'name': self.name,
            'owner_id': self.owner_id,
            'capacity': self.capacity,
            'created': self.created,
            'edited': self.edited,
            'viewed': self.viewed,
            'deleted': self.deleted,
            'hidden': self.hidden,
        }

    def save(self) -> None:
        if not self._id:
            raise ValueError('Partition ID is not set')
        if not query_db('SELECT id FROM partitions WHERE id=?', (self._id,), True):
            query_db(
                'INSERT INTO partitions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (
                    self._id,
                    self._drive_id,
                    self._name,
                    self._owner_id,
                    self._capacity,
                    self._created,
                    self._edited,
                    self._viewed,
                    self._deleted,
                    self._hidden,
                )
            )
        else:
            query_db(
                'UPDATE partitions SET drive_id=?, name=?, owner_id=?, capacity=?, created=?, edited=?, viewed=?, deleted=?, hidden=? WHERE id=?',
                (
                    self._drive_id,
                    self._name,
                    self._owner_id,
                    self._capacity,
                    self._created,
                    self._edited,
                    self._viewed,
                    self._deleted,
                    self._hidden,
                    self._id,
                )
            )

    @classmethod
    def load(cls, id_: str) -> 'Partition':
        db_result = query_db(
            'SELECT id, drive_id, name, owner_id, capacity, created, edited, viewed, deleted, hidden FROM partitions WHERE id=?',
            (id_,),
            True
        )
        if not db_result:
            raise ValueError(f"No partition with id {id_} has been found.")
        return Partition(
            id_=db_result[0],
            drive_id=db_result[1],
            name=db_result[2],
            owner_id=db_result[3],
            capacity=db_result[4],
            created=db_result[5],
            edited=db_result[6],
            viewed=db_result[7],
            deleted=db_result[8],
            hidden=db_result[9],
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
    def drive_id(self) -> str:
        return self._drive_id

    @drive_id.setter
    def drive_id(self, value: str) -> None:
        self._drive_id = value

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._name = value

    @property
    def owner_id(self) -> str:
        return self._owner_id

    @owner_id.setter
    def owner_id(self, value: str) -> None:
        self._owner_id = value

    @property
    def capacity(self) -> int:
        return self._capacity

    @capacity.setter
    def capacity(self, value: int) -> None:
        self._capacity = value

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
