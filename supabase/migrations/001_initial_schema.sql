-- Sessions: one per receipt
create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  host_phone text,
  restaurant_name text,
  host_venmo text,
  image_url text,
  subtotal numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2),
  tip_amount numeric(10,2) default 0,
  status text default 'parsing' check (status in ('parsing', 'active', 'finalized'))
);

-- Items: line items from the receipt
create table items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  quantity integer default 1
);

-- People: participants in a session
create table people (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  color text not null,
  is_host boolean default false,
  is_done boolean default false,
  created_at timestamptz default now()
);

-- Claims: who claimed what
create table claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  split_count integer not null default 1,
  custom_amount numeric(10,2),
  custom_fraction text,
  created_at timestamptz default now(),
  unique (item_id, person_id)
);

-- Indexes
create index idx_items_session on items(session_id);
create index idx_people_session on people(session_id);
create index idx_claims_item on claims(item_id);
create index idx_claims_person on claims(person_id);

-- Enable realtime on claims table
alter publication supabase_realtime add table claims;
alter publication supabase_realtime add table people;
