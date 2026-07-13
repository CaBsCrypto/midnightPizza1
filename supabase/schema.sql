-- Esquema de Supabase para el backend de matchmaking/combate de Clash of Pizzas.
-- Reemplaza el estado en memoria que antes vivía en backend/main.go (Go + WebSockets).
-- Ejecutar en el SQL Editor del proyecto de Supabase.

create table if not exists matchmaking_queue (
  player_id text primary key,
  username text not null,
  created_at timestamptz not null default now()
);

create table if not exists invite_lobbies (
  invite_hash text primary key,
  host_player_id text not null,
  host_username text not null,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id text primary key,
  player1_id text not null,
  player2_id text not null,
  player1_username text not null,
  player2_username text not null,
  turn_p1 boolean not null default true,
  started boolean not null default false,
  over boolean not null default false,
  p1_board jsonb,
  p2_board jsonb,
  p1_hp int not null default 5,
  p2_hp int not null default 5,
  p1_score int not null default 0,
  p2_score int not null default 0,
  p1_immunity boolean not null default false,
  p2_immunity boolean not null default false,
  p1_bitten jsonb not null default '[[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false]]'::jsonb,
  p2_bitten jsonb not null default '[[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false],[false,false,false,false,false,false]]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists room_by_player (
  player_id text primary key,
  room_id text not null references rooms(id) on delete cascade
);

-- RLS activado sin políticas públicas: solo el service_role (usado desde las funciones
-- serverless de /api) puede leer o escribir estas tablas. El cliente del navegador (anon key)
-- no tiene acceso directo a ninguna de ellas; solo se suscribe a canales de Realtime Broadcast.
alter table matchmaking_queue enable row level security;
alter table invite_lobbies enable row level security;
alter table rooms enable row level security;
alter table room_by_player enable row level security;
