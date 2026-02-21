import typing as t

from ..main import query_db
from ...util.rand import rand_id

import partition as partition_module


class Drive:
    def __init__(
            self,
            id_: t.Union[str,None]=None,
            location: str='',
            name: str='',
            description: str='',
    ):
        self._id = ''
        self._location = ''
        self._name = ''
        self._description = ''
        if id_ is None:
            id_ = rand_id('drive')
        self.id_ = id_
        self.location = location
        self.name = name
        self.description = description

    def __str__(self) -> str:
        return self.id_

    def __dict__(self) -> dict:
        return {
            'id_': self.id_,
            'location': self.location,
            'name': self.name,
            'description': self.description,
        }

    def save(self) -> None:
        if not self._id:
            raise ValueError('Drive ID is not set')
        if not query_db('SELECT id FROM drives WHERE id=?', (self._id,), True):
            query_db(
                'INSERT INTO drives VALUES (?, ?, ?, ?)',
                (
                    self._id,
                    self._location,
                    self._name,
                    self._description,
                )
            )
        else:
            query_db(
                'UPDATE drives SET location=?, name=?, description=? WHERE id=?',
                (
                    self._location,
                    self._name,
                    self._description,
                    self._id,
                )
            )

    @classmethod
    def load(cls, id_: str) -> 'Drive':
        db_result = query_db(
            'SELECT id, location, name, description FROM drives WHERE id=?',
            (id_,),
            True
        )
        if not db_result:
            raise ValueError(f"No drive with id {id_} has been found.")
        return Drive(
            id_=db_result[0],
            location=db_result[1],
            name=db_result[2],
            description=db_result[3],
        )

    def to_json(self) -> dict:
        return self.__dict__()

    @property
    def id_(self) -> str:
        return self._id

    @id_.setter
    def id_(self, value: str) -> None:
        self._id = value

    @property
    def location(self) -> str:
        return self._location

    @location.setter
    def location(self, value: str) -> None:
        self._location = value

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

    def get_partitions(self) -> t.List[partition_module.Partition]:
        result = query_db('SELECT id FROM partitions WHERE drive_id=?', (self.id_,))
        return [partition_module.Partition.load(row[0]) for row in result]
