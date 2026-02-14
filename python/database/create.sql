CREATE TABLE IF NOT EXISTS used_ids (
    id TEXT PRIMARY KEY,
    created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ips (
    ip TEXT PRIMARY KEY,
    score INTEGER NOT NULL,
    description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    salt TEXT NOT NULL,
    totp TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login TEXT NOT NULL,
    tos_accepted TEXT NOT NULL,
    balance INTEGER NOT NULL,
    theme TEXT NOT NULL,
    locale TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created TEXT NOT NULL,
    expires TEXT NOT NULL,
    browser TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS drives (
    id TEXT PRIMARY KEY,
    location TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS partitions (
    id TEXT PRIMARY KEY,
    drive_id TEXT NOT NULL,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    created TEXT NOT NULL,
    edited TEXT NOT NULL,
    viewed TEXT NOT NULL,
    deleted TEXT NULL,  -- null if not deleted, else datetime
    hidden INTEGER NOT NULL, -- 0 for visible, 1 for hidden
    FOREIGN KEY (drive_id) REFERENCES drives(id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS entries(
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- `file`, `folder`, `link`
    name TEXT NOT NULL,
    parent_id TEXT NULL,  -- null if in root folder
    owner_id TEXT NOT NULL,
    partition_id TEXT NOT NULL,
    created TEXT NOT NULL,
    edited TEXT NOT NULL,
    viewed TEXT NOT NULL,
    deleted TEXT NULL,  -- null if not deleted, else datetime
    hidden INTEGER NOT NULL, -- 0 for visible, 1 for hidden

    -- file specific
    size INTEGER NULL,
    hash TEXT NULL,
    encrypted INTEGER NULL,
    encryption_hash TEXT NULL,  -- also null if not encrypted

    -- link specific
    target_id TEXT NULL,  -- also null if pointing to a root folder
    target_partition_id TEXT NULL,

    FOREIGN KEY (parent_id) REFERENCES entries(id),
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (partition_id) REFERENCES partitions(id),
    FOREIGN KEY (target_id) REFERENCES entries(id),
    FOREIGN KEY (target_partition_id) REFERENCES partitions(id)
);
CREATE TABLE IF NOT EXISTS tags(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS tag_relations(
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    created TEXT NOT NULL,
    FOREIGN KEY (tag_id) REFERENCES tags(id),
    FOREIGN KEY (entry_id) REFERENCES entries(id)
);
CREATE TABLE IF NOT EXISTS tag_tag_relations(
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    created TEXT NOT NULL,
    FOREIGN KEY (tag_id) REFERENCES tags(id),
    FOREIGN KEY (parent_id) REFERENCES tags(id)
);
CREATE TABLE IF NOT EXISTS entry_shares(
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created TEXT NOT NULL,
    allow_write INTEGER NOT NULL,  -- 0 for read-only, 1 for read-write
    FOREIGN KEY (entry_id) REFERENCES entries(id),
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS partition_shares(
    id TEXT PRIMARY KEY,
    partition_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created TEXT NOT NULL,
    allow_write INTEGER NOT NULL,  -- 0 for read-only, 1 for read-write
    FOREIGN KEY (partition_id) REFERENCES partitions(id),
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    type TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
