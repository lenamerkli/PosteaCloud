from datetime import datetime
import typing as t

from ..main import query_db
from ...util.misc import DATE_FORMAT
from ...util.rand import rand_id


class Tag:

    def __init__(
            self,
            id_: t.Union[str,None]=None,
            name: str='',
            description: str='',
            created: t.Union[datetime,str,None]=None,
            owner_id: str='',
    ):
        self._id = ''
        self._name = ''
        self._description = ''
        self._created = ''
        self._owner_id = ''
        if id_ is None:
            id_ = rand_id('tag')
        if created is None:
            created = datetime.now()
        self.id_ = id_
        self.name = name
        self.description = description
        self.created = created
        self.owner_id = owner_id

    def __str__(self) -> str:
        return self.id_

    def __dict__(self) -> dict:
        return {
            'id_': self.id_,
            'name': self.name,
            'description': self.description,
            'created': self.created,
            'owner_id': self.owner_id,
        }

    def save(self) -> None:
        if not self._id:
            raise ValueError('Tag ID is not set')
        if not query_db('SELECT id FROM tags WHERE id=?', (self._id,), True):
            query_db(
                'INSERT INTO tags VALUES (?, ?, ?, ?, ?)',
                (
                    self._id,
                    self._name,
                    self._description,
                    self._created,
                    self._owner_id,
                )
            )
        else:
            query_db(
                'UPDATE tags SET name=?, description=?, created=?, owner_id=? WHERE id=?',
                (
                    self._name,
                    self._description,
                    self._created,
                    self._owner_id,
                    self._id,
                )
            )

    @classmethod
    def load(cls, id_: str) -> 'Tag':
        db_result = query_db(
            'SELECT id, name, description, created, owner_id FROM tags WHERE id=?',
            (id_,),
            True
        )
        if not db_result:
            raise ValueError(f"No tag with id {id_} has been found.")
        return Tag(
            id_=db_result[0],
            name=db_result[1],
            description=db_result[2],
            created=db_result[3],
            owner_id=db_result[4],
        )

    def to_json(self) -> dict:
        data = self.__dict__()
        data['created'] = data['created'].strftime(DATE_FORMAT)
        return data

    @property
    def id_(self) -> str:
        return self._id

    @id_.setter
    def id_(self, value: str) -> None:
        self._id = value

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._name = value

    @property
    def description(self) -> str:
        return self._description

    @description.setter
    def description(self, value: str) -> None:
        self._description = value

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
    def owner_id(self) -> str:
        return self._owner_id

    @owner_id.setter
    def owner_id(self, value: str) -> None:
        self._owner_id = value
