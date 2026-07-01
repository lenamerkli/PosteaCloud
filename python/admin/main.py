from datetime import datetime
from os.path import abspath, dirname, join
from logging import log

from flask import Blueprint, request

from database.classes.drive import Drive
from database.classes.partition import Partition
from database.classes.user import User
from database.main import query_db
from security.login import get_user_id
from util.misc import DATE_FORMAT


admin_blueprint = Blueprint('admin', __name__)


# ---------------------------------------------------------------------------
# Admin authentication / authorization helpers
# ---------------------------------------------------------------------------

_ADMINS_FILE = join(dirname(abspath(__file__)), 'admins.txt')


def _load_admin_usernames() -> set:
    """Load the set of usernames that have admin access from admins.txt."""
    admins = set()
    try:
        with open(_ADMINS_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                username = line.strip()
                if not username or username.startswith('#'):
                    continue
                admins.add(username)
    except FileNotFoundError:
        log(20, "admin: admins.txt not found, no admins configured")
    return admins


def _auth_admin():
    """
    Authenticate the session and verify the user has admin privileges.
    Returns (user, None) or (None, error_response).
    """
    user_id = get_user_id()
    if not user_id:
        return None, ({'error': 'authentication error', 'message': 'Invalid session.'}, 401)
    try:
        user = User.load(user_id)
    except ValueError:
        return None, ({'error': 'authentication error', 'message': 'User not found.'}, 401)
    if user.username not in _load_admin_usernames():
        return None, ({'error': 'forbidden', 'message': 'Admin privileges required.'}, 403)
    return user, None


def _json_request():
    """Parse JSON body, returning (data_dict, None) or (None, error_response)."""
    try:
        data = dict(request.get_json(silent=True) or {})
    except Exception as e:
        log(20, f"admin: invalid JSON: {e}")
        return None, ({'error': 'Invalid JSON'}, 400)
    return data, None


# ---------------------------------------------------------------------------
# Drives
# ---------------------------------------------------------------------------

@admin_blueprint.route('/api/v1/admin/drives', methods=['GET'])
def r_admin_drives_get():
    user, err = _auth_admin()
    if err:
        return err

    result = query_db('SELECT id FROM drives')
    drives_json = []
    for row in result:
        try:
            drives_json.append(Drive.load(row[0]).to_json())
        except ValueError:
            continue
    return {'success': 'success', 'message': 'Drives retrieved.', 'drives': drives_json}, 200


@admin_blueprint.route('/api/v1/admin/drives', methods=['POST'])
def r_admin_drives_post():
    user, err = _auth_admin()
    if err:
        return err

    data, err = _json_request()
    if err:
        return err

    name = (data.get('name') or '').strip()
    if not name:
        return {'error': 'validation', 'message': 'name is required.'}, 400
    location = (data.get('location') or '').strip()
    if not location:
        return {'error': 'validation', 'message': 'location is required.'}, 400
    description = data.get('description') or ''

    drive = Drive(name=name, location=location, description=description)
    drive.save()

    return {'success': 'success', 'message': 'Drive created.', 'drive': drive.to_json()}, 201


@admin_blueprint.route('/api/v1/admin/drives/<drive_id>', methods=['GET'])
def r_admin_drives_drive_get(drive_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        drive = Drive.load(drive_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Drive not found.'}, 404

    return {'success': 'success', 'message': 'Drive retrieved.', 'drive': drive.to_json()}, 200


@admin_blueprint.route('/api/v1/admin/drives/<drive_id>', methods=['PUT'])
def r_admin_drives_drive_put(drive_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        drive = Drive.load(drive_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Drive not found.'}, 404

    data, err = _json_request()
    if err:
        return err

    if 'name' in data:
        name = (data['name'] or '').strip()
        if name:
            drive.name = name
    if 'location' in data:
        location = (data['location'] or '').strip()
        if location:
            drive.location = location
    if 'description' in data:
        drive.description = data['description'] or ''

    drive.save()
    return {'success': 'success', 'message': 'Drive updated.', 'drive': drive.to_json()}, 200


@admin_blueprint.route('/api/v1/admin/drives/<drive_id>', methods=['DELETE'])
def r_admin_drives_drive_delete(drive_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        Drive.load(drive_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Drive not found.'}, 404

    # Prevent deletion if partitions still reference this drive
    referenced = query_db(
        'SELECT id FROM partitions WHERE drive_id=? AND deleted IS NULL', (drive_id,), True
    )
    if referenced:
        return {
            'error': 'validation',
            'message': 'Drive still has active partitions. Remove them first.',
        }, 400

    query_db('DELETE FROM drives WHERE id=?', (drive_id,))
    return {'success': 'success', 'message': 'Drive deleted.'}, 200


# ---------------------------------------------------------------------------
# Partitions
# ---------------------------------------------------------------------------

@admin_blueprint.route('/api/v1/admin/partitions', methods=['GET'])
def r_admin_partitions_get():
    user, err = _auth_admin()
    if err:
        return err

    include_deleted = (request.args.get('include_deleted') or '').lower() in ('1', 'true', 'yes')
    if include_deleted:
        result = query_db('SELECT id FROM partitions')
    else:
        result = query_db('SELECT id FROM partitions WHERE deleted IS NULL')

    partitions_json = []
    for row in result:
        try:
            partitions_json.append(Partition.load(row[0]).to_json())
        except ValueError:
            continue
    return {'success': 'success', 'message': 'Partitions retrieved.', 'partitions': partitions_json}, 200


@admin_blueprint.route('/api/v1/admin/partitions', methods=['POST'])
def r_admin_partitions_post():
    user, err = _auth_admin()
    if err:
        return err

    data, err = _json_request()
    if err:
        return err

    name = (data.get('name') or '').strip()
    if not name:
        return {'error': 'validation', 'message': 'name is required.'}, 400
    drive_id = (data.get('drive_id') or '').strip()
    if not drive_id:
        return {'error': 'validation', 'message': 'drive_id is required.'}, 400
    owner_id = (data.get('owner_id') or '').strip()
    if not owner_id:
        return {'error': 'validation', 'message': 'owner_id is required.'}, 400

    try:
        Drive.load(drive_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Drive not found.'}, 404

    if not query_db('SELECT id FROM users WHERE id=?', (owner_id,), True):
        return {'error': 'not found', 'message': 'Owner user not found.'}, 404

    capacity = data.get('capacity', 0)
    try:
        capacity = int(capacity)
        if capacity < 0:
            raise ValueError
    except (TypeError, ValueError):
        return {'error': 'validation', 'message': 'capacity must be a non-negative integer.'}, 400

    hidden = int(bool(data.get('hidden', 0)))

    partition = Partition(
        name=name,
        drive_id=drive_id,
        owner_id=owner_id,
        capacity=capacity,
        hidden=hidden,
    )
    partition.save()

    return {'success': 'success', 'message': 'Partition created.', 'partition': partition.to_json()}, 201


@admin_blueprint.route('/api/v1/admin/partitions/<partition_id>', methods=['GET'])
def r_admin_partitions_partition_get(partition_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        partition = Partition.load(partition_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Partition not found.'}, 404

    return {'success': 'success', 'message': 'Partition retrieved.', 'partition': partition.to_json()}, 200


@admin_blueprint.route('/api/v1/admin/partitions/<partition_id>', methods=['PUT'])
def r_admin_partitions_partition_put(partition_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        partition = Partition.load(partition_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Partition not found.'}, 404

    data, err = _json_request()
    if err:
        return err

    if 'name' in data:
        name = (data['name'] or '').strip()
        if name:
            partition.name = name
    if 'drive_id' in data:
        drive_id = (data['drive_id'] or '').strip()
        if drive_id:
            try:
                Drive.load(drive_id)
            except ValueError:
                return {'error': 'not found', 'message': 'Drive not found.'}, 404
            partition.drive_id = drive_id
    if 'owner_id' in data:
        owner_id = (data['owner_id'] or '').strip()
        if owner_id:
            if not query_db('SELECT id FROM users WHERE id=?', (owner_id,), True):
                return {'error': 'not found', 'message': 'Owner user not found.'}, 404
            partition.owner_id = owner_id
    if 'capacity' in data:
        try:
            capacity = int(data['capacity'])
            if capacity < 0:
                raise ValueError
        except (TypeError, ValueError):
            return {'error': 'validation', 'message': 'capacity must be a non-negative integer.'}, 400
        partition.capacity = capacity
    if 'hidden' in data:
        partition.hidden = int(bool(data['hidden']))
    if 'deleted' in data:
        deleted_val = data['deleted']
        if deleted_val is None:
            partition.deleted = None
        elif deleted_val:
            partition.deleted = datetime.now()

    partition.edited = datetime.now()
    partition.save()
    return {'success': 'success', 'message': 'Partition updated.', 'partition': partition.to_json()}, 200


@admin_blueprint.route('/api/v1/admin/partitions/<partition_id>', methods=['DELETE'])
def r_admin_partitions_partition_delete(partition_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        partition = Partition.load(partition_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Partition not found.'}, 404

    partition.deleted = datetime.now()
    partition.save()
    return {'success': 'success', 'message': 'Partition moved to trash.'}, 200

# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@admin_blueprint.route('/api/v1/admin/accounts', methods=['GET'])
def r_admin_accounts_get():
    user, err = _auth_admin()
    if err:
        return err

    result = query_db('SELECT id FROM users')
    accounts = []
    for row in result:
        try:
            accounts.append(User.load(row[0]).to_json())
        except ValueError:
            continue
    return {'success': 'success', 'message': 'Accounts retrieved.', 'accounts': accounts}, 200


@admin_blueprint.route('/api/v1/admin/accounts', methods=['POST'])
def r_admin_accounts_post():
    user, err = _auth_admin()
    if err:
        return err

    data, err = _json_request()
    if err:
        return err

    username = (data.get('username') or '').strip()
    if not username:
        return {'error': 'validation', 'message': 'username is required.'}, 400
    email = (data.get('email') or '').strip()
    if not email:
        return {'error': 'validation', 'message': 'email is required.'}, 400

    # The client is expected to obtain the hashed password from
    # `/api/v1/hash_password` and submit the returned `salt` and `hash`.
    salt = (data.get('salt') or '').strip()
    password_hash = (data.get('hash') or data.get('password') or '').strip()
    if not salt or not password_hash:
        return {
            'error': 'validation',
            'message': 'salt and hash are required (obtain them from /api/v1/hash_password).',
        }, 400
    totp = (data.get('totp') or '').strip()
    if not totp:
        return {'error': 'validation', 'message': 'totp secret is required.'}, 400

    if query_db('SELECT id FROM users WHERE email=?', (email,), True):
        return {'error': 'validation', 'message': 'A user with that email already exists.'}, 400
    if query_db('SELECT id FROM users WHERE username=?', (username,), True):
        return {'error': 'validation', 'message': 'A user with that username already exists.'}, 400

    balance = int(data.get('balance', 0) or 0)
    theme = data.get('theme') or ''
    locale = data.get('locale') or ''

    new_user = User(
        username=username,
        email=email,
        password=password_hash,
        salt=salt,
        totp=totp,
        balance=balance,
        theme=theme,
        locale=locale,
    )
    new_user.save()

    return {'success': 'success', 'message': 'Account created.', 'account': new_user.to_json()}, 201


@admin_blueprint.route('/api/v1/admin/accounts/<user_id>', methods=['GET'])
def r_admin_accounts_account_get(user_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        target = User.load(user_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Account not found.'}, 404

    return {'success': 'success', 'message': 'Account retrieved.', 'account': target.to_json()}, 200


@admin_blueprint.route('/api/v1/admin/accounts/<user_id>', methods=['PUT'])
def r_admin_accounts_account_put(user_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        target = User.load(user_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Account not found.'}, 404

    data, err = _json_request()
    if err:
        return err

    if 'username' in data:
        username = (data['username'] or '').strip()
        if username:
            existing = query_db(
                'SELECT id FROM users WHERE username=? AND id<>?', (username, user_id), True
            )
            if existing:
                return {'error': 'validation', 'message': 'Username already in use.'}, 400
            target.username = username
    if 'email' in data:
        email = (data['email'] or '').strip()
        if email:
            existing = query_db(
                'SELECT id FROM users WHERE email=? AND id<>?', (email, user_id), True
            )
            if existing:
                return {'error': 'validation', 'message': 'Email already in use.'}, 400
            target.email = email
    if 'balance' in data:
        try:
            target.balance = int(data['balance'])
        except (TypeError, ValueError):
            return {'error': 'validation', 'message': 'balance must be an integer.'}, 400
    if 'theme' in data:
        target.theme = data['theme'] or ''
    if 'locale' in data:
        target.locale = data['locale'] or ''
    if 'totp' in data:
        totp = (data['totp'] or '').strip()
        if totp:
            target.totp = totp

    target.save()
    return {'success': 'success', 'message': 'Account updated.', 'account': target.to_json()}, 200


@admin_blueprint.route('/api/v1/admin/accounts/<user_id>/password', methods=['PUT'])
def r_admin_accounts_account_password(user_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        target = User.load(user_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Account not found.'}, 404

    data, err = _json_request()
    if err:
        return err

    # The client is expected to obtain the hashed password from
    # `/api/v1/hash_password` and submit the returned `salt` and `hash`.
    salt = (data.get('salt') or '').strip()
    password_hash = (data.get('hash') or data.get('password') or '').strip()
    if not salt or not password_hash:
        return {
            'error': 'validation',
            'message': 'salt and hash are required (obtain them from /api/v1/hash_password).',
        }, 400

    target.salt = salt
    target.password = password_hash
    target.save()

    # Invalidate all active sessions for this user so the password change
    # takes effect immediately.
    query_db(
        'UPDATE sessions SET expires=? WHERE user_id=?',
        (datetime.now().strftime(DATE_FORMAT), user_id),
    )

    return {'success': 'success', 'message': 'Password reset.'}, 200


@admin_blueprint.route('/api/v1/admin/accounts/<user_id>', methods=['DELETE'])
def r_admin_accounts_account_delete(user_id: str):
    user, err = _auth_admin()
    if err:
        return err

    try:
        target = User.load(user_id)
    except ValueError:
        return {'error': 'not found', 'message': 'Account not found.'}, 404

    if target.id_ == user.id_:
        return {'error': 'validation', 'message': 'You cannot delete your own account.'}, 400

    # Invalidate sessions, soft-delete partitions, then remove the user.
    query_db('UPDATE sessions SET expires=? WHERE user_id=?', (datetime.now().strftime(DATE_FORMAT), user_id))
    query_db('UPDATE partitions SET deleted=? WHERE owner_id=? AND deleted IS NULL', (datetime.now().strftime(DATE_FORMAT), user_id))
    query_db('DELETE FROM users WHERE id=?', (user_id,))

    return {'success': 'success', 'message': 'Account deleted.'}, 200


# ---------------------------------------------------------------------------
# Usage statistics
# ---------------------------------------------------------------------------

@admin_blueprint.route('/api/v1/admin/usage', methods=['GET'])
def r_admin_usage():
    user, err = _auth_admin()
    if err:
        return err

    # --- Per drive ---
    drives_result = query_db('SELECT id FROM drives')
    drives = []
    for row in drives_result:
        drive_id = row[0]
        cap_row = query_db(
            'SELECT COALESCE(SUM(capacity), 0) FROM partitions WHERE drive_id=? AND deleted IS NULL',
            (drive_id,), True
        )
        used_row = query_db(
            'SELECT COALESCE(SUM(e.size), 0) FROM entries e '
            'JOIN partitions p ON p.id = e.partition_id '
            'WHERE p.drive_id=? AND e.type=? AND e.deleted IS NULL AND p.deleted IS NULL',
            (drive_id, 'file'), True
        )
        drives.append({
            'drive_id': drive_id,
            'capacity': cap_row[0] if cap_row else 0,
            'used': used_row[0] if used_row else 0,
        })

    # --- Per partition ---
    parts_result = query_db('SELECT id FROM partitions WHERE deleted IS NULL')
    partitions = []
    for row in parts_result:
        partition_id = row[0]
        try:
            part = Partition.load(partition_id)
        except ValueError:
            continue
        used_row = query_db(
            'SELECT COALESCE(SUM(size), 0) FROM entries '
            'WHERE partition_id=? AND type=? AND deleted IS NULL',
            (partition_id, 'file'), True
        )
        partitions.append({
            'partition_id': partition_id,
            'capacity': part.capacity,
            'used': used_row[0] if used_row else 0,
        })

    # --- Per user ---
    users_result = query_db('SELECT id FROM users')
    users = []
    for row in users_result:
        user_id = row[0]
        cap_row = query_db(
            'SELECT COALESCE(SUM(capacity), 0) FROM partitions WHERE owner_id=? AND deleted IS NULL',
            (user_id,), True
        )
        used_row = query_db(
            'SELECT COALESCE(SUM(e.size), 0) FROM entries e '
            'JOIN partitions p ON p.id = e.partition_id '
            'WHERE p.owner_id=? AND e.type=? AND e.deleted IS NULL AND p.deleted IS NULL',
            (user_id, 'file'), True
        )
        users.append({
            'user_id': user_id,
            'capacity': cap_row[0] if cap_row else 0,
            'used': used_row[0] if used_row else 0,
        })

    total_capacity = sum(d['capacity'] for d in drives)
    total_used = sum(d['used'] for d in drives)

    return {
        'success': 'success',
        'message': 'Usage retrieved.',
        'total_capacity': total_capacity,
        'total_used': total_used,
        'drives': drives,
        'partitions': partitions,
        'users': users,
    }, 200


# ---------------------------------------------------------------------------
# IP score table
# ---------------------------------------------------------------------------

@admin_blueprint.route('/api/v1/admin/ips', methods=['GET'])
def r_admin_ips_get():
    user, err = _auth_admin()
    if err:
        return err

    result = query_db('SELECT ip, score, description FROM ips')
    ips = [
        {'ip': row[0], 'score': row[1], 'description': row[2]}
        for row in result
    ]
    return {'success': 'success', 'message': 'IP score table retrieved.', 'ips': ips}, 200


@admin_blueprint.route('/api/v1/admin/ips', methods=['POST'])
def r_admin_ips_post():
    user, err = _auth_admin()
    if err:
        return err

    data, err = _json_request()
    if err:
        return err

    ip = (data.get('ip') or '').strip()
    if not ip:
        return {'error': 'validation', 'message': 'ip is required.'}, 400
    try:
        score = int(data.get('score', 0))
    except (TypeError, ValueError):
        return {'error': 'validation', 'message': 'score must be an integer.'}, 400
    description = data.get('description') or ''

    if query_db('SELECT ip FROM ips WHERE ip=?', (ip,), True):
        return {'error': 'validation', 'message': 'IP already exists. Use PUT to update.'}, 400

    query_db(
        'INSERT INTO ips (ip, score, description) VALUES (?, ?, ?)',
        (ip, score, description),
    )
    return {
        'success': 'success',
        'message': 'IP score entry created.',
        'ip': {'ip': ip, 'score': score, 'description': description},
    }, 201


@admin_blueprint.route('/api/v1/admin/ips/<ip>', methods=['GET'])
def r_admin_ips_ip_get(ip: str):
    user, err = _auth_admin()
    if err:
        return err

    row = query_db('SELECT ip, score, description FROM ips WHERE ip=?', (ip,), True)
    if not row:
        return {'error': 'not found', 'message': 'IP not found.'}, 404
    return {
        'success': 'success',
        'message': 'IP score entry retrieved.',
        'ip': {'ip': row[0], 'score': row[1], 'description': row[2]},
    }, 200


@admin_blueprint.route('/api/v1/admin/ips/<ip>', methods=['PUT'])
def r_admin_ips_ip_put(ip: str):
    user, err = _auth_admin()
    if err:
        return err

    row = query_db('SELECT ip FROM ips WHERE ip=?', (ip,), True)
    if not row:
        return {'error': 'not found', 'message': 'IP not found.'}, 404

    data, err = _json_request()
    if err:
        return err

    update_score = None
    update_description = None
    if 'score' in data:
        try:
            update_score = int(data['score'])
        except (TypeError, ValueError):
            return {'error': 'validation', 'message': 'score must be an integer.'}, 400
    if 'description' in data:
        update_description = data['description'] or ''

    if update_score is not None and update_description is not None:
        query_db('UPDATE ips SET score=?, description=? WHERE ip=?', (update_score, update_description, ip))
    elif update_score is not None:
        query_db('UPDATE ips SET score=? WHERE ip=?', (update_score, ip))
    elif update_description is not None:
        query_db('UPDATE ips SET description=? WHERE ip=?', (update_description, ip))
    else:
        return {'error': 'validation', 'message': 'No fields to update.'}, 400

    new_row = query_db('SELECT ip, score, description FROM ips WHERE ip=?', (ip,), True)
    return {
        'success': 'success',
        'message': 'IP score entry updated.',
        'ip': {'ip': new_row[0], 'score': new_row[1], 'description': new_row[2]},
    }, 200


@admin_blueprint.route('/api/v1/admin/ips/<ip>', methods=['DELETE'])
def r_admin_ips_ip_delete(ip: str):
    user, err = _auth_admin()
    if err:
        return err

    row = query_db('SELECT ip FROM ips WHERE ip=?', (ip,), True)
    if not row:
        return {'error': 'not found', 'message': 'IP not found.'}, 404

    query_db('DELETE FROM ips WHERE ip=?', (ip,))
    return {'success': 'success', 'message': 'IP score entry deleted.'}, 200
