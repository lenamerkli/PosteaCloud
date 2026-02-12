from dotenv import load_dotenv
from flask import g
from os import path
from os.path import join
from sqlite3 import connect as sqlite_connect, Connection as SQLite_Connection


__all__ = [
    'database_init',
    'get_db',
    'query_db',
]


load_dotenv()


def get_db() -> SQLite_Connection:
    """
    Gets the database instance
    :return: a pointer to the database
    """
    db = getattr(g, '_database', None)
    if db is None:
        # Use absolute path to ensure consistent database location
        db_path = path.join(path.dirname(path.abspath(__file__)), 'database.sqlite')
        db = g._database = sqlite_connect(db_path)
    return db


def query_db(query, args=(), one=False) -> list | tuple:
    """
    Runs a SQL query
    :param query: the query as a SQL statement
    :param args: arguments to be inserted into the query
    :param one: if this function should only return one result
    :return: the data from the database
    """
    conn = get_db()
    cur = conn.execute(query, args)
    result = cur.fetchall()
    conn.commit()
    cur.close()
    return (result[0] if result else None) if one else result


def database_init(app) -> None:
    @app.teardown_appcontext
    def close_connection(exception=None) -> None:  # noqa
        """
        destroys the database point
        :param exception: unused
        :return:
        """
        db = getattr(g, '_database', None)
        if db is not None:
            db.close()
    with app.app_context():
        with open(join(app.root_path, 'database/create.sql'), 'r') as f:
            _create = f.read()
        _conn = get_db()
        _conn.executescript(_create)
        _conn.commit()
        _conn.close()
