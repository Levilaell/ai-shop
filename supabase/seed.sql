-- ============================================================================
-- T1 — Local seed (runs on `supabase db reset`)
-- ----------------------------------------------------------------------------
-- LOCAL DEV ONLY. Creates a confirmed test user, an account, the membership,
-- and a few candidate products so the approval queue isn't empty.
--   login: operator@local.test / password123
-- Fixed UUIDs make the data reproducible across resets. Seed runs as the
-- superuser, so RLS does not apply here.
-- ============================================================================

-- 1) Test auth user ----------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  -- GoTrue scans these token columns into non-nullable Go strings at login;
  -- leaving them NULL makes sign-in 500 with "converting NULL to string". Set ''.
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'operator@local.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false,
  '', '', '', '', ''
)
on conflict (id) do nothing;

-- identity row required by GoTrue for email/password sign-in.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"operator@local.test","email_verified":true}'::jsonb,
  'email', now(), now(), now()
)
on conflict do nothing;

-- 2) Account + membership ----------------------------------------------------
insert into public.accounts (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Operador Teste')
on conflict (id) do nothing;

insert into public.account_users (account_id, user_id, role)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'owner'
)
on conflict do nothing;

-- 3) Candidate products ------------------------------------------------------
insert into public.products (
  account_id, external_ref, affiliate_platform, title,
  price_brl, commission_pct, category, affiliate_link, status
)
values
  ('22222222-2222-2222-2222-222222222222', 'TT-1001', 'tiktok_shop',
   'Cortador de legumes multifuncional 8 em 1',
   79.90, 18.0, 'cozinha', 'https://shop.tiktok.com/aff/TT-1001', 'product_candidate'),
  ('22222222-2222-2222-2222-222222222222', 'TT-1002', 'tiktok_shop',
   'Organizador de cabos magnético para mesa',
   49.90, 22.0, 'tech_acessorios', 'https://shop.tiktok.com/aff/TT-1002', 'product_candidate'),
  ('22222222-2222-2222-2222-222222222222', 'TT-1003', 'tiktok_shop',
   'Luminária LED de mesa dobrável recarregável',
   119.90, 15.0, 'casa', 'https://shop.tiktok.com/aff/TT-1003', 'product_candidate'),
  ('22222222-2222-2222-2222-222222222222', 'TT-2001', 'tiktok_shop',
   'Sérum facial clareador (uso contínuo)',
   89.90, 25.0, 'beleza', 'https://shop.tiktok.com/aff/TT-2001', 'product_candidate')
on conflict (account_id, affiliate_platform, external_ref) do nothing;
