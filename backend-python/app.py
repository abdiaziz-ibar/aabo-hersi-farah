"""Python API for Aabo. Uses the PostgreSQL schema from ../backend/migrations."""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import bcrypt
import jwt
import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row

load_dotenv(Path(__file__).with_name('.env'))
DATABASE_URL = os.getenv('DATABASE_URL', '')
JWT_SECRET = os.getenv('JWT_SECRET', '')
if len(JWT_SECRET) < 32 or re.search(r'change-?me|example|secret-here', JWT_SECRET, re.I):
    raise RuntimeError('Set JWT_SECRET to a random value at least 32 characters long.')
if not DATABASE_URL:
    raise RuntimeError('Set DATABASE_URL in backend-python/.env')

TZ = os.getenv('APP_TIMEZONE', 'Africa/Mogadishu')
app = FastAPI(title='Aabo API', version='1.0.0')
origins = [x.strip() for x in os.getenv('CORS_ORIGIN', '').split(',') if x.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['*'], allow_headers=['*'])


def db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=10)


def tr(request: Request, so: str, en: str) -> str:
    return en if request.headers.get('x-lang') == 'en' else so


def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with db() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def public_user(row):
    return {'id': str(row['id']), 'username': row['username'], 'fullName': row.get('full_name') or '',
            'role': row['role'], 'active': row['active'], 'locked': bool(row.get('locked', False)),
            'failedAttempts': row.get('failed_attempts', 0),
            'createdAt': row['created_at'].isoformat() if row.get('created_at') else None}


def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Login required')
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=['HS256'])
        rows = query('SELECT * FROM users WHERE id = %s', (payload['sub'],))
    except Exception:
        raise HTTPException(401, 'Your session has expired')
    if not rows:
        raise HTTPException(401, 'Your session has expired')
    u = rows[0]
    if not u['active'] or u.get('locked') or u['token_version'] != payload.get('tv'):
        raise HTTPException(401, 'Your session has expired')
    return u


def admin(user=Depends(current_user)):
    if user['role'] != 'admin':
        raise HTTPException(403, 'Only an admin can do this')
    return user


def token(user, remember=False):
    exp = datetime.now(timezone.utc) + timedelta(days=30 if remember else 1)
    return jwt.encode({'sub': str(user['id']), 'tv': user['token_version'], 'exp': exp}, JWT_SECRET, algorithm='HS256')


@app.get('/api/health')
def health():
    query('SELECT 1')
    return {'ok': True}


@app.post('/api/auth/login')
async def login(request: Request):
    body = await request.json()
    username, password = str(body.get('username', '')).strip(), str(body.get('password', ''))
    if not username or not password:
        raise HTTPException(400, tr(request, 'Geli username iyo password', 'Enter username and password'))
    rows = query('SELECT * FROM users WHERE lower(username)=lower(%s)', (username,))
    user = rows[0] if rows else None
    # Use the same adaptive password hash for unknown names to reduce username timing leaks.
    dummy = b'$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxy87kle3xk9Z9z7u'
    try:
        ok = bcrypt.checkpw(password.encode(), user['password_hash'].encode() if user else dummy)
    except ValueError:
        ok = False
    if not user or not ok:
        raise HTTPException(401, tr(request, 'Username ama password waa khalad', 'Wrong username or password'))
    if user.get('locked'):
        raise HTTPException(423, tr(request, 'Xisaabtan waa la xidhay. La xiriir maamulaha.', 'This account is locked. Contact an administrator.'))
    if not user['active']:
        raise HTTPException(403, tr(request, 'Xisaabtan waa la xidhay. La xiriir maamulaha.', 'This account is disabled. Contact the administrator.'))
    if user['failed_attempts']:
        query('UPDATE users SET failed_attempts=0 WHERE id=%s', (user['id'],))
    return {'token': token(user, bool(body.get('remember'))), 'user': public_user(user)}


@app.get('/api/auth/me')
def me(user=Depends(current_user)):
    return {'user': public_user(user)}


def password_problem(password, username=''):
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        return 'Password must be at least 8 characters'
    if password.lower() in {'password', 'password123', '12345678', 'admin123', 'qwerty123'} or password.lower() == username.lower() or len(set(password)) == 1:
        return 'That password is too easy to guess. Choose a stronger one.'
    return None


@app.post('/api/auth/change-password')
async def change_password(request: Request, user=Depends(current_user)):
    body = await request.json()
    nxt = body.get('next')
    issue = password_problem(nxt, user['username'])
    if issue:
        raise HTTPException(400, issue)
    if not bcrypt.checkpw(str(body.get('current', '')).encode(), user['password_hash'].encode()):
        raise HTTPException(400, tr(request, 'Password-ka hadda jira waa khalad', 'Current password is incorrect'))
    hashed = bcrypt.hashpw(nxt.encode(), bcrypt.gensalt()).decode()
    updated = query('UPDATE users SET password_hash=%s, token_version=token_version+1, failed_attempts=0 WHERE id=%s RETURNING *', (hashed, user['id']))[0]
    return {'token': token(updated, True)}


SELECT_TX = """SELECT t.*, COALESCE(NULLIF(u.full_name,''),u.username) AS created_by_name,m.name AS method_name
FROM transactions t LEFT JOIN users u ON u.id=t.created_by LEFT JOIN payment_methods m ON m.id=t.method_id"""


def tx_api(r):
    d = r['date']
    return {'id': str(r['id']), 'type': r['type'], 'amount': float(r['amount']), 'accountId': r['account_id'],
            'party': r['party'], 'place': r['place'], 'date': d.isoformat(), 'createdBy': r.get('created_by_name'),
            'methodId': r.get('method_id'), 'methodName': r.get('method_name'), 'methodNumber': r.get('method_number')}


@app.get('/api/transactions')
def transactions(user=Depends(current_user)):
    return [tx_api(x) for x in query(SELECT_TX + ' ORDER BY t.date DESC,t.id DESC')]


@app.post('/api/transactions', status_code=201)
async def add_transaction(request: Request, user=Depends(current_user)):
    b = await request.json()
    if b.get('type') not in ('income', 'expense'):
        raise HTTPException(400, 'type must be income or expense')
    try:
        amount = Decimal(str(b.get('amount'))).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        date = datetime.fromisoformat(str(b.get('date')).replace('Z', '+00:00')) if b.get('date') else datetime.now(timezone.utc)
        if date.tzinfo is None: date = date.replace(tzinfo=timezone.utc)
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(400, 'Invalid amount or date')
    party, place = str(b.get('party', '')).strip()[:120], str(b.get('place', '')).strip()[:80] or 'Kale'
    account = b.get('accountId')
    if amount <= 0 or amount > Decimal('1e12'): raise HTTPException(400, 'amount must be > 0')
    if not isinstance(account, str) or not account: raise HTTPException(400, 'account is required')
    if not party: raise HTTPException(400, 'party is required')
    if date > datetime.now(timezone.utc) + timedelta(hours=36) or date.year < 2000: raise HTTPException(400, 'date out of range')
    method_id = str(b['methodId']) if b.get('methodId') else None
    method_number = str(b.get('methodNumber', '')).strip() if method_id else None
    if method_id and not 3 <= len(method_number) <= 40: raise HTTPException(400, 'method number must be 3-40 characters')
    if not query('SELECT id FROM accounts WHERE id=%s AND active', (account,)): raise HTTPException(400, 'Account not found or archived')
    if method_id and not query('SELECT id FROM payment_methods WHERE id=%s AND active', (method_id,)): raise HTTPException(400, 'Payment method not found or archived')
    local = date.astimezone(ZoneInfo(TZ))
    if query('SELECT 1 FROM period_closes WHERE year=%s AND month=%s', (local.year, local.month)):
        raise HTTPException(409, tr(request, 'Bisha waa xiran tahay. Maamuluhu waa inuu dib u furaa si wax loo bedelo.', 'This month is closed. An admin must reopen it to make changes.'))
    inserted = query('''INSERT INTO transactions (created_by,type,amount,account_id,party,place,date,method_id,method_number)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''', (user['id'], b['type'], amount, account, party, place, date, method_id, method_number))[0]
    if method_id and method_number:
        query('INSERT INTO payment_method_numbers(method_id,number) VALUES(%s,%s) ON CONFLICT DO NOTHING', (method_id, method_number))
    return tx_api(query(SELECT_TX + ' WHERE t.id=%s', (inserted['id'],))[0])


@app.delete('/api/transactions/{tx_id}', status_code=204)
def delete_transaction(tx_id: str, request: Request, user=Depends(admin)):
    if not tx_id.isdigit(): raise HTTPException(400, 'bad id')
    rows = query('SELECT date FROM transactions WHERE id=%s', (tx_id,))
    if not rows: return Response(status_code=204)
    d = rows[0]['date'].astimezone(ZoneInfo(TZ))
    if query('SELECT 1 FROM period_closes WHERE year=%s AND month=%s', (d.year, d.month)):
        raise HTTPException(409, tr(request, 'Bisha waa xiran tahay. Maamuluhu waa inuu dib u furaa si wax loo bedelo.', 'This month is closed. An admin must reopen it to make changes.'))
    query('DELETE FROM transactions WHERE id=%s', (tx_id,))
    return Response(status_code=204)


@app.get('/api/accounts')
def accounts(user=Depends(current_user)):
    return [{'id': r['id'], 'name': r['name'], 'icon': r['icon'], 'active': r['active']} for r in query('SELECT * FROM accounts ORDER BY sort,created_at')]


@app.get('/api/methods')
def methods(user=Depends(current_user)):
    rows = query('SELECT * FROM payment_methods ORDER BY sort,created_at')
    numbers = query('SELECT * FROM payment_method_numbers ORDER BY created_at,id')
    return [{'id': r['id'], 'name': r['name'], 'kind': r['kind'], 'active': r['active'],
             'numbers': [{'id': str(n['id']), 'number': n['number'], 'label': n.get('label') or ''} for n in numbers if n['method_id'] == r['id']]}
            for r in rows]
