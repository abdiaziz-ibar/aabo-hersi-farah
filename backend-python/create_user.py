"""Create the first admin or reset an existing user's password."""
import getpass
import os
import re
from pathlib import Path

import bcrypt
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(Path(__file__).with_name('.env'))
username = input('Username: ').strip()
password = getpass.getpass('Password (8+ characters): ')
if not re.fullmatch(r'[a-zA-Z0-9._-]{3,32}', username):
    raise SystemExit('Username must be 3-32 letters, digits, dot, underscore, or hyphen.')
if len(password) < 8 or password.lower() in {'password', 'password123', '12345678', username.lower()}:
    raise SystemExit('Choose a stronger password (at least 8 characters).')
with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM users ORDER BY id LIMIT 1')
        first = cur.fetchone()
        if first:
            cur.execute('UPDATE users SET password_hash=%s,token_version=token_version+1,failed_attempts=0,locked=false,locked_at=NULL WHERE lower(username)=lower(%s) RETURNING id',
                        (bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(), username))
            if not cur.fetchone():
                raise SystemExit('User not found. Existing users are managed from the app.')
            print('Password reset and login lock cleared.')
        else:
            cur.execute('INSERT INTO users(username,role,password_hash) VALUES(%s,\'admin\',%s)',
                        (username, bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()))
            print('First admin created.')
