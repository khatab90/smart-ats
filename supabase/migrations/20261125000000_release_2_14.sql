-- Migration 9 — release 2.14.0: installed apps offer the update.
update public.app_config set latest_app_version = '2.14.0', updated_at = now() where id;
