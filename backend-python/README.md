# Aabo Python API

Python/FastAPI implementation of the Aabo API. The existing React web and Expo mobile clients remain JavaScript/TypeScript clients and can use this API without changes.

## Run

1. Create `backend-python/.env` with `DATABASE_URL` (the same PostgreSQL/Neon URL used by the existing backend) and a random `JWT_SECRET` of at least 32 characters.
2. From this directory, install `pip install -r requirements.txt`.
3. Start with `uvicorn app:app --host 0.0.0.0 --port 4000`.

Before the first login, create an admin with `python create_user.py` (it prompts securely for credentials).

This implementation uses the database schema created by the existing `backend` migrations. It does not run JavaScript migrations. The current release covers health, login/session/password change, transaction listing/creation/deletion, and basic account and payment-method listing. Remaining admin/security, closing, CSV-import/report, and management routes still need to be ported before replacing the existing Node server in production.
