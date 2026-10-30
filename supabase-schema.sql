-- Run this in your Supabase SQL editor

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  pet_name text not null,
  quantity int not null default 0,
  created_at timestamptz default now(),
  unique(account_id, pet_name)
);
