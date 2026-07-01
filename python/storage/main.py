from datetime import datetime
from flask import Blueprint, Response, request
from logging import log
import tempfile
from werkzeug.utils import secure_filename

from database.classes.entry import Entry
from database.classes.partition import Partition
from database.classes.user import User
from database.main import query_db
from security.login import get_user_id
from util.misc import DATE_FORMAT
from util.rand import rand_id


storage_blueprint = Blueprint('storage', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_request():
    """Parse JSON body, returning (data_dict, None) or (None, error_response)."""
    try:
        data = dict(request.get_json(silent=True) or {})
    except Exception as e:
        log(20, f"storage: invalid JSON: {e}")
        return None, ({'error': 'Invalid JSON'}, 400)
    return data, None


def _auth_user():
    """
    Authenticate and return a User object.
    Returns (user, None) or (None, error_response).
    """
    user_id = get_user_id()
    if not user_id:
        return None, ({'error': 'authentication error', 'message': 'Invalid session.'}, 401)
    try:
        user = User.load(user_id)
    except ValueError:
        return None, ({'error': 'authentication error', 'message': 'User not found.'}, 401)
    return user, None


def _get_partition_or_error(partition_id: str, user: User):
    """Load a partition and check access. Returns (partition, None) or (None, error)."""
    try:
        part = Partition.load(partition_id)
    except ValueError:
        return None, ({'error': 'not found', 'message': 'Partition not found.'}, 404)
    if not part.can_user_access(user):
        return None, ({'error': 'forbidden', 'message': 'Access denied.'}, 403)
    return part, None


def _get_entry_or_error(entry_id: str, user_id: str):
    """Load an entry and check access. Returns (entry, None) or (None, error)."""
    try:
        entry = Entry.load(entry_id)
    except ValueError:
        return None, ({'error': 'not found', 'message': 'Entry not found.'}, 404)
    if not entry.can_user_access(user_id):
        return None, ({'error': 'forbidden', 'message': 'Access denied.'}, 403)
    return entry, None


def _check_partition_edit(part: Partition, user: User):
    """Return None if user can edit, else an error response tuple."""
    if not part.can_user_edit(user):
        return {'error': 'forbidden', 'message': 'Write access denied.'}, 403
    return None


def _check_entry_edit(entry: Entry, user_id: str):
    """Return None if user can edit, else an error response tuple."""
    if not entry.can_user_edit(user_id):
        return {'error': 'forbidden', 'message': 'Write access denied.'}, 403
    return None


def _enrich_entry(entry: Entry, user_id: str) -> dict:
    """Convert an entry to JSON and add ownership/permission fields."""
    data = entry.to_json()
    data['owned'] = entry.owner_id == user_id
    data['can_write'] = entry.can_user_edit(user_id)
    return data


def _enrich_partition(part: Partition, user: User) -> dict:
    """Convert a partition to JSON and add ownership/permission fields."""
    data = part.to_json()
    data['owned'] = part.owner_id == user.id_
    data['can_write'] = part.can_user_edit(user)
    return data


def _sanitize_filename_for_header(name: str) -> str:
    """Sanitize a filename for use in the Content-Disposition header."""
    # secure_filename strips path separators and dangerous characters;
    # if the result is empty (e.g. all characters were stripped), fall back
    # to a safe default.
    sanitized = secure_filename(name)
    if not sanitized:
        sanitized = 'download'
    # Escape backslash and double-quote per RFC 6266
    sanitized = sanitized.replace('\\', '\\\\').replace('"', '\\"')
    return sanitized


# ---------------------------------------------------------------------------
# Partitions
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/partitions', methods=['GET'])
def r_partitions_get():
    user, err = _auth_user()
    if err:
        return err

    owned = query_db(
        'SELECT id FROM partitions WHERE owner_id=? AND deleted IS NULL',
        (user.id_,)
    )
    owned_ids = [row[0] for row in owned]

    shared = query_db(
        'SELECT ps.partition_id FROM partition_shares ps '
        'JOIN partitions p ON p.id = ps.partition_id '
        'WHERE ps.user_id=? AND p.deleted IS NULL',
        (user.id_,)
    )
    shared_ids = [row[0] for row in shared]

    all_ids = owned_ids + shared_ids
    partitions_json = []
    for pid in all_ids:
        try:
            p = Partition.load(pid)
        except ValueError:
            continue
        partitions_json.append(_enrich_partition(p, user))

    return {
        'success': 'success',
        'message': 'Partitions retrieved.',
        'partitions': partitions_json,
    }, 200


@storage_blueprint.route('/api/v1/partitions/<partition_id>', methods=['GET'])
def r_partitions_partition_get(partition_id: str):
    user, err = _auth_user()
    if err:
        return err

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    return {
        'success': 'success',
        'message': 'Partition retrieved.',
        'partition': _enrich_partition(part, user),
    }, 200


@storage_blueprint.route('/api/v1/partitions/<partition_id>', methods=['DELETE'])
def r_partitions_partition_delete(partition_id: str):
    user, err = _auth_user()
    if err:
        return err

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    edit_err = _check_partition_edit(part, user)
    if edit_err:
        return edit_err

    part.deleted = datetime.now()
    part.save()

    return {
        'success': 'success',
        'message': 'Partition moved to trash.',
    }, 200


# ---------------------------------------------------------------------------
# Entries — listing
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/partitions/<partition_id>/entries', methods=['GET'])
def r_partitions_partition_entries(partition_id: str):
    user, err = _auth_user()
    if err:
        return err

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    entries = part.root_entries()
    entries_json = [_enrich_entry(e, user.id_) for e in entries]

    return {
        'success': 'success',
        'message': 'Entries retrieved.',
        'entries': entries_json,
    }, 200


@storage_blueprint.route('/api/v1/entries/<entry_id>/children', methods=['GET'])
def r_entries_entry_children(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    if entry.type_ != 'folder':
        return {'error': 'invalid type', 'message': 'Entry is not a folder.'}, 400

    result = query_db(
        'SELECT id FROM entries WHERE parent_id=? AND deleted IS NULL',
        (entry_id,)
    )
    children_json = []
    for row in result:
        try:
            child = Entry.load(row[0])
        except ValueError:
            continue
        children_json.append(_enrich_entry(child, user.id_))

    return {
        'success': 'success',
        'message': 'Children retrieved.',
        'entries': children_json,
    }, 200


@storage_blueprint.route('/api/v1/entries/<entry_id>', methods=['GET'])
def r_entries_entry_get(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    return {
        'success': 'success',
        'message': 'Entry retrieved.',
        'entry': _enrich_entry(entry, user.id_),
    }, 200


@storage_blueprint.route('/api/v1/entries/<entry_id>/path', methods=['GET'])
def r_entries_entry_path(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    path_parts = [_enrich_entry(entry, user.id_)]
    current = entry
    while current.parent_id:
        try:
            parent = Entry.load(current.parent_id)
        except ValueError:
            break
        if not parent.can_user_access(user.id_):
            break
        path_parts.insert(0, _enrich_entry(parent, user.id_))
        current = parent

    # Prepend the root partition
    partition = entry.get_partition()
    path_parts.insert(0, _enrich_partition(partition, user))

    return {
        'success': 'success',
        'message': 'Path retrieved.',
        'path': path_parts,
    }, 200


# ---------------------------------------------------------------------------
# Entries — creation
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/entries', methods=['POST'])
def r_entries():
    """Create a folder or symlink entry."""
    user, err = _auth_user()
    if err:
        return err

    data, err = _json_request()
    if err:
        return err

    entry_type = data.get('type_', 'folder')
    if entry_type not in ('folder', 'link'):
        return {'error': 'validation', 'message': 'type_ must be "folder" or "link".'}, 400

    name = (data.get('name') or '').strip()
    if not name:
        return {'error': 'validation', 'message': 'Entry name is required.'}, 400

    partition_id = data.get('partition_id', '')
    if not partition_id:
        return {'error': 'validation', 'message': 'partition_id is required.'}, 400

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    edit_err = _check_partition_edit(part, user)
    if edit_err:
        return edit_err

    parent_id = data.get('parent_id') or None

    if parent_id:
        parent_entry, parent_err = _get_entry_or_error(parent_id, user.id_)
        if parent_err:
            return parent_err
        if parent_entry.type_ != 'folder':
            return {'error': 'invalid type', 'message': 'Parent must be a folder.'}, 400

    if entry_type == 'folder':
        entry = Entry(
            type_='folder',
            name=name,
            parent_id=parent_id,
            owner_id=user.id_,
            partition_id=partition_id,
        )
        entry.save()
    else:  # link
        target_id = data.get('target_id') or None
        target_partition_id = data.get('target_partition_id') or None
        if not target_id and not target_partition_id:
            return {'error': 'validation', 'message': 'Link requires target_id or target_partition_id.'}, 400
        entry = Entry(
            type_='link',
            name=name,
            parent_id=parent_id,
            owner_id=user.id_,
            partition_id=partition_id,
            target_id=target_id,
            target_partition_id=target_partition_id,
        )
        entry.save()

    return {
        'success': 'success',
        'message': 'Entry created.',
        'entry': _enrich_entry(entry, user.id_),
    }, 201


@storage_blueprint.route('/api/v1/entries/<parent_id>/upload', methods=['POST'])
def r_etnries_parent_upload(parent_id: str):
    """
    Upload a file.  ``parent_id`` can be a folder entry id or a partition id
    (for uploading directly into a partition root).
    """
    user, err = _auth_user()
    if err:
        return err

    parent_entry = None
    partition = None
    actual_parent_id = None

    # Try loading as a folder entry first
    try:
        parent_entry = Entry.load(parent_id)
    except ValueError:
        pass

    if parent_entry:
        if parent_entry.type_ != 'folder':
            return {'error': 'invalid type', 'message': 'Parent must be a folder.'}, 400
        part, err = _get_partition_or_error(parent_entry.partition_id, user)
        if err:
            return err
        partition = part
        actual_parent_id = parent_entry.id_
        if not parent_entry.can_user_edit(user.id_):
            return {'error': 'forbidden', 'message': 'Write access denied.'}, 403
    else:
        # Treat as a partition
        part, err = _get_partition_or_error(parent_id, user)
        if err:
            return err
        partition = part
        actual_parent_id = None
        edit_err = _check_partition_edit(partition, user)
        if edit_err:
            return edit_err

    if 'file' not in request.files:
        return {'error': 'validation', 'message': 'No file provided.'}, 400

    file = request.files['file']
    if not file.filename or file.filename.strip() == '':
        return {'error': 'validation', 'message': 'File has no name.'}, 400

    name = file.filename.strip()

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = tmp.name
            file.save(tmp_path)

        entry = Entry.create_file(
            path=tmp_path,
            partition=partition,
            owner_id=user.id_,
            parent_id=actual_parent_id,
            name=name,
        )
    except Exception as ex:
        log(20, f"storage: upload failed: {ex}")
        return {'error': 'upload failed', 'message': str(ex)}, 500
    finally:
        # The file has been moved into the storage backend by create_file on
        # success; if an error occurred before or during creation the temp file
        # should still be cleaned up.
        if tmp_path is not None:
            import os as _os
            try:
                _os.unlink(tmp_path)
            except FileNotFoundError:
                pass

    entry.save()

    return {
        'success': 'success',
        'message': 'File uploaded.',
        'entry': _enrich_entry(entry, user.id_),
    }, 201


# ---------------------------------------------------------------------------
# Entries — download
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/entries/<entry_id>/download', methods=['GET'])
def r_entries_entry_download(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    if entry.type_ != 'file':
        return {'error': 'invalid type', 'message': 'Entry is not a file.'}, 400

    content = entry.read()
    entry.save()

    safe_name = _sanitize_filename_for_header(entry.name)

    return Response(
        content,
        mimetype='application/octet-stream',
        headers={
            'Content-Disposition': f'attachment; filename="{safe_name}"',
            'Content-Length': str(entry.size or len(content)),
        },
    ), 200


# ---------------------------------------------------------------------------
# Entries — update / rename / move
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/entries/<entry_id>', methods=['PUT'])
def r_entries_entry_put(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    edit_err = _check_entry_edit(entry, user.id_)
    if edit_err:
        return edit_err

    data, err = _json_request()
    if err:
        return err

    if 'name' in data:
        name = (data['name'] or '').strip()
        if name:
            entry.name = name

    if 'parent_id' in data:
        new_parent_id = data['parent_id'] or None
        if new_parent_id:
            new_parent, parent_err = _get_entry_or_error(new_parent_id, user.id_)
            if parent_err:
                return parent_err
            if new_parent.type_ != 'folder':
                return {'error': 'invalid type', 'message': 'New parent must be a folder.'}, 400
            if new_parent.partition_id != entry.partition_id:
                return {'error': 'validation', 'message': 'Cannot move entry across partitions.'}, 400
        entry.parent_id = new_parent_id

    entry.update_edited()
    entry.save()

    return {
        'success': 'success',
        'message': 'Entry updated.',
        'entry': _enrich_entry(entry, user.id_),
    }, 200


# ---------------------------------------------------------------------------
# Entries — delete / restore
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/entries/<entry_id>', methods=['DELETE'])
def r_entries_entry_delete(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    edit_err = _check_entry_edit(entry, user.id_)
    if edit_err:
        return edit_err

    entry.deleted = datetime.now()
    entry.save()

    return {
        'success': 'success',
        'message': 'Entry moved to trash.',
    }, 200


@storage_blueprint.route('/api/v1/entries/<entry_id>/restore', methods=['POST'])
def r_entries_entry_restore(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    # Load the entry without the usual access check — restore requires strict
    # ownership, not just write access via sharing.
    try:
        entry = Entry.load(entry_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Entry not found.'}, 404

    if entry.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can restore.'}, 403

    if not entry.deleted:
        return {'error': 'invalid', 'message': 'Entry is not in trash.'}, 400

    entry.deleted = None
    entry.update_edited()
    entry.save()

    return {
        'success': 'success',
        'message': 'Entry restored.',
        'entry': _enrich_entry(entry, user.id_),
    }, 200


# ---------------------------------------------------------------------------
# Trash
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/trash', methods=['GET'])
def r_trash():
    user, err = _auth_user()
    if err:
        return err

    result = query_db(
        'SELECT id FROM entries WHERE owner_id=? AND deleted IS NOT NULL',
        (user.id_,)
    )
    entries_json = []
    for row in result:
        try:
            e = Entry.load(row[0])
        except ValueError:
            continue
        entries_json.append(_enrich_entry(e, user.id_))

    return {
        'success': 'success',
        'message': 'Trash retrieved.',
        'entries': entries_json,
    }, 200


# ---------------------------------------------------------------------------
# Sharing — partitions
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/partitions/<partition_id>/share', methods=['GET'])
def r_partitions_partition_share_list(partition_id: str):
    user, err = _auth_user()
    if err:
        return err

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    if part.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can view shares.'}, 403

    result = query_db(
        'SELECT ps.user_id, u.username, ps.allow_write, ps.created '
        'FROM partition_shares ps '
        'JOIN users u ON u.id = ps.user_id '
        'WHERE ps.partition_id=?',
        (partition_id,),
    )
    shares = [
        {
            'user_id': row[0],
            'username': row[1],
            'allow_write': bool(row[2]),
            'created': row[3],
        }
        for row in result
    ]
    return {
        'success': 'success',
        'message': 'Partition shares retrieved.',
        'shares': shares,
    }, 200


@storage_blueprint.route('/api/v1/partitions/<partition_id>/share', methods=['POST'])
def r_partitions_partition_share(partition_id: str):
    user, err = _auth_user()
    if err:
        return err

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    if part.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can share.'}, 403

    data, err = _json_request()
    if err:
        return err

    target_user_id = (data.get('user_id') or '').strip()
    if not target_user_id:
        return {'error': 'validation', 'message': 'user_id is required.'}, 400

    if not query_db('SELECT id FROM users WHERE id=?', (target_user_id,), True):
        return {'error': 'not found', 'message': 'Target user not found.'}, 404

    allow_write = data.get('allow_write', 0)
    if allow_write not in (0, 1):
        allow_write = 0

    existing = query_db(
        'SELECT id FROM partition_shares WHERE partition_id=? AND user_id=?',
        (partition_id, target_user_id),
        True,
    )
    if existing:
        query_db(
            'UPDATE partition_shares SET allow_write=? WHERE id=?',
            (allow_write, existing[0]),
        )
        share_id = existing[0]
    else:
        share_id = rand_id('pshare')
        query_db(
            'INSERT INTO partition_shares (id, partition_id, owner_id, user_id, created, allow_write) '
            'VALUES (?, ?, ?, ?, ?, ?)',
            (share_id, partition_id, user.id_, target_user_id,
             datetime.now().strftime(DATE_FORMAT), allow_write),
        )

    return {
        'success': 'success',
        'message': 'Partition shared.',
        'share_id': share_id,
    }, 200


@storage_blueprint.route('/api/v1/partitions/<partition_id>/share/<target_user_id>', methods=['DELETE'])
def r_partitions_partition_share_user(partition_id: str, target_user_id: str):
    user, err = _auth_user()
    if err:
        return err

    part, err = _get_partition_or_error(partition_id, user)
    if err:
        return err

    if part.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can revoke shares.'}, 403

    query_db(
        'DELETE FROM partition_shares WHERE partition_id=? AND user_id=?',
        (partition_id, target_user_id),
    )

    return {
        'success': 'success',
        'message': 'Partition share revoked.',
    }, 200


# ---------------------------------------------------------------------------
# Sharing — entries
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/entries/<entry_id>/share', methods=['GET'])
def r_entries_entry_share_list(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    if entry.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can view shares.'}, 403

    result = query_db(
        'SELECT es.user_id, u.username, es.allow_write, es.created '
        'FROM entry_shares es '
        'JOIN users u ON u.id = es.user_id '
        'WHERE es.entry_id=?',
        (entry_id,),
    )
    shares = [
        {
            'user_id': row[0],
            'username': row[1],
            'allow_write': bool(row[2]),
            'created': row[3],
        }
        for row in result
    ]
    return {
        'success': 'success',
        'message': 'Entry shares retrieved.',
        'shares': shares,
    }, 200


@storage_blueprint.route('/api/v1/entries/<entry_id>/share', methods=['POST'])
def r_entries_entry_share(entry_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    if entry.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can share.'}, 403

    data, err = _json_request()
    if err:
        return err

    target_user_id = (data.get('user_id') or '').strip()
    if not target_user_id:
        return {'error': 'validation', 'message': 'user_id is required.'}, 400

    if not query_db('SELECT id FROM users WHERE id=?', (target_user_id,), True):
        return {'error': 'not found', 'message': 'Target user not found.'}, 404

    allow_write = data.get('allow_write', 0)
    if allow_write not in (0, 1):
        allow_write = 0

    existing = query_db(
        'SELECT id FROM entry_shares WHERE entry_id=? AND user_id=?',
        (entry_id, target_user_id),
        True,
    )
    if existing:
        query_db(
            'UPDATE entry_shares SET allow_write=? WHERE id=?',
            (allow_write, existing[0]),
        )
        share_id = existing[0]
    else:
        share_id = rand_id('eshare')
        query_db(
            'INSERT INTO entry_shares (id, entry_id, owner_id, user_id, created, allow_write) '
            'VALUES (?, ?, ?, ?, ?, ?)',
            (share_id, entry_id, user.id_, target_user_id,
             datetime.now().strftime(DATE_FORMAT), allow_write),
        )

    return {
        'success': 'success',
        'message': 'Entry shared.',
        'share_id': share_id,
    }, 200


@storage_blueprint.route(
    '/api/v1/entries/<entry_id>/share/<target_user_id>', methods=['DELETE'],
)
def r_entries_entry_share_user(entry_id: str, target_user_id: str):
    user, err = _auth_user()
    if err:
        return err

    entry, err = _get_entry_or_error(entry_id, user.id_)
    if err:
        return err

    if entry.owner_id != user.id_:
        return {'error': 'forbidden', 'message': 'Only the owner can revoke shares.'}, 403

    query_db(
        'DELETE FROM entry_shares WHERE entry_id=? AND user_id=?',
        (entry_id, target_user_id),
    )

    return {
        'success': 'success',
        'message': 'Entry share revoked.',
    }, 200


@storage_blueprint.route('/api/v1/shared', methods=['GET'])
def r_shared():
    user, err = _auth_user()
    if err:
        return err

    shared_partitions = query_db(
        'SELECT partition_id, allow_write FROM partition_shares WHERE user_id=?',
        (user.id_,),
    )
    shared_entries = query_db(
        'SELECT entry_id, allow_write FROM entry_shares WHERE user_id=?',
        (user.id_,),
    )

    partitions = []
    for row in shared_partitions:
        try:
            p = Partition.load(row[0])
            d = p.to_json()
            d['can_write'] = bool(row[1])
            partitions.append(d)
        except ValueError:
            continue

    entries = []
    for row in shared_entries:
        try:
            e = Entry.load(row[0])
            d = e.to_json()
            d['can_write'] = bool(row[1])
            entries.append(d)
        except ValueError:
            continue

    return {
        'success': 'success',
        'message': 'Shared items retrieved.',
        'partitions': partitions,
        'entries': entries,
    }, 200


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/search', methods=['GET'])
def r_search():
    user, err = _auth_user()
    if err:
        return err

    q = (request.args.get('q') or '').strip()
    if not q:
        return {'error': 'validation', 'message': 'Query parameter "q" is required.'}, 400

    partition_filter = (request.args.get('partition_id') or '').strip()

    owned = query_db('SELECT id FROM partitions WHERE owner_id=?', (user.id_,))
    shared = query_db('SELECT partition_id FROM partition_shares WHERE user_id=?', (user.id_,))
    accessible_ids = set(row[0] for row in owned) | set(row[0] for row in shared)

    if partition_filter and partition_filter not in accessible_ids:
        return {'error': 'forbidden', 'message': 'Access to partition denied.'}, 403

    like_q = f'%{q}%'
    if partition_filter:
        result = query_db(
            'SELECT id FROM entries WHERE name LIKE ? AND partition_id=? AND deleted IS NULL',
            (like_q, partition_filter),
        )
    else:
        if not accessible_ids:
            return {
                'success': 'success',
                'message': 'Search complete.',
                'entries': [],
            }, 200
        placeholders = ','.join('?' * len(accessible_ids))
        result = query_db(
            f'SELECT id FROM entries WHERE name LIKE ? '
            f'AND partition_id IN ({placeholders}) AND deleted IS NULL',
            (like_q,) + tuple(accessible_ids),
        )

    entries_json = []
    for row in result:
        try:
            e = Entry.load(row[0])
        except ValueError:
            continue
        if e.can_user_access(user.id_):
            entries_json.append(_enrich_entry(e, user.id_))

    return {
        'success': 'success',
        'message': 'Search complete.',
        'entries': entries_json,
    }, 200


# ---------------------------------------------------------------------------
# Recent
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/recent', methods=['GET'])
def r_recent():
    user, err = _auth_user()
    if err:
        return err

    owned = query_db('SELECT id FROM partitions WHERE owner_id=?', (user.id_,))
    shared = query_db('SELECT partition_id FROM partition_shares WHERE user_id=?', (user.id_,))
    accessible_ids = set(row[0] for row in owned) | set(row[0] for row in shared)

    if not accessible_ids:
        return {
            'success': 'success',
            'message': 'Recent entries retrieved.',
            'entries': [],
        }, 200

    limit = 50
    placeholders = ','.join('?' * len(accessible_ids))
    result = query_db(
        f'SELECT id FROM entries WHERE partition_id IN ({placeholders}) '
        f'AND deleted IS NULL ORDER BY viewed DESC LIMIT ?',
        tuple(accessible_ids) + (limit,),
    )

    entries_json = []
    for row in result:
        try:
            e = Entry.load(row[0])
        except ValueError:
            continue
        if e.can_user_access(user.id_):
            entries_json.append(_enrich_entry(e, user.id_))

    return {
        'success': 'success',
        'message': 'Recent entries retrieved.',
        'entries': entries_json,
    }, 200


# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

@storage_blueprint.route('/api/v1/usage', methods=['GET'])
def r_usage():
    user, err = _auth_user()
    if err:
        return err

    owned = query_db(
        'SELECT id, capacity FROM partitions WHERE owner_id=? AND deleted IS NULL',
        (user.id_,)
    )

    total_capacity = 0
    total_used = 0
    partitions_detail = []

    for row in owned:
        pid, capacity = row[0], row[1]
        total_capacity += capacity
        size_row = query_db(
            'SELECT COALESCE(SUM(size), 0) FROM entries '
            'WHERE partition_id=? AND type=? AND deleted IS NULL',
            (pid, 'file'),
            True,
        )
        used = size_row[0] if size_row else 0
        total_used += used
        partitions_detail.append({
            'partition_id': pid,
            'capacity': capacity,
            'used': used,
        })

    return {
        'success': 'success',
        'message': 'Usage retrieved.',
        'total_capacity': total_capacity,
        'total_used': total_used,
        'partitions': partitions_detail,
    }, 200
