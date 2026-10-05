-- Circolo Vizioso: codici per sbloccare i giochi plus, e giocatori.
-- NON ancora applicato a nessun database: va incollato nell'SQL editor di Supabase (o applicato come migrazione) da chi
-- ha accesso al progetto. Riletto prima di applicarlo.
--
-- Regole di sicurezza:
--  * le tabelle hanno la Row Level Security accesa e nessuna policy: dal browser (chiave anon) non si legge e non si
--    scrive niente direttamente;
--  * il gioco parla col database solo attraverso riscatta(), che è l'unica funzione concessa a "anon";
--  * genera_codici() e sgancia_codice() sono solo per te (SQL editor / chiave service_role), mai concesse ad anon.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ lotti e codici

-- un lotto = un gioco plus da sbloccare (es. 'jukebox-cinema', 'jukebox-blackbox')
create table if not exists public.lotti (
  id          text primary key,
  descrizione text,
  creato_il   timestamptz not null default now()
);

create table if not exists public.codici (
  codice      text primary key,                 -- 10 caratteri normalizzati (alfabeto senza 0/O, 1/I/L, U)
  lotto       text not null references public.lotti (id),
  assegnato_a text,                             -- handle Instagram, lo scrivi tu quando mandi il DM
  dispositivo uuid,                             -- id casuale salvato nel browser; vuoto finché il codice non è usato
  usato_il    timestamptz,
  creato_il   timestamptz not null default now()
);
create index if not exists codici_lotto_idx on public.codici (lotto);

-- tentativi sbagliati, per limitare chi prova codici a caso
create table if not exists public.tentativi (
  dispositivo uuid not null,
  quando      timestamptz not null default now()
);
create index if not exists tentativi_idx on public.tentativi (dispositivo, quando);

alter table public.lotti     enable row level security;
alter table public.codici    enable row level security;
alter table public.tentativi enable row level security;
revoke all on public.lotti, public.codici, public.tentativi from anon, authenticated;

-- ------------------------------------------------------------------ riscattare un codice (l'unica cosa che fa il gioco)

-- Risposta: { ok: true, lotto } oppure { ok: false, errore: 'non_valido' | 'gia_usato' | 'troppi_tentativi' }.
-- Lo stesso dispositivo può riusare lo stesso codice (ricaricare la pagina non deve rompere niente).
create or replace function public.riscatta(p_codice text, p_dispositivo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.codici%rowtype;
  norm text;
begin
  if p_dispositivo is null then
    return jsonb_build_object('ok', false, 'errore', 'non_valido');
  end if;

  if (select count(*) from public.tentativi
        where dispositivo = p_dispositivo and quando > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'errore', 'troppi_tentativi');
  end if;

  -- si accettano minuscole, trattini e spazi; 0/O, 1/I/L sono la stessa cosa (come nell'alfabeto di Crockford)
  norm := upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g'));
  norm := translate(norm, 'OIL', '011');

  select * into c from public.codici where codice = norm for update;

  if not found then
    insert into public.tentativi (dispositivo) values (p_dispositivo);
    return jsonb_build_object('ok', false, 'errore', 'non_valido');
  end if;

  if c.dispositivo is null then
    update public.codici set dispositivo = p_dispositivo, usato_il = now() where codice = norm;
    return jsonb_build_object('ok', true, 'lotto', c.lotto);
  elsif c.dispositivo = p_dispositivo then
    return jsonb_build_object('ok', true, 'lotto', c.lotto);
  end if;

  insert into public.tentativi (dispositivo) values (p_dispositivo);
  return jsonb_build_object('ok', false, 'errore', 'gia_usato');
end;
$$;

revoke all on function public.riscatta(text, uuid) from public;
grant execute on function public.riscatta(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------------ solo per te

-- genera_codici('jukebox-cinema', 100) → 100 codici nuovi, uno per riga (formato mostrato: XXXXX-XXXXX)
create or replace function public.genera_codici(p_lotto text, p_quanti int)
returns setof text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';   -- 30 simboli, niente 0 O 1 I L U
  fatti int := 0;
  nuovo text;
  b bytea;
  i int;
begin
  if not exists (select 1 from public.lotti where id = p_lotto) then
    raise exception 'lotto % inesistente: crealo prima in public.lotti', p_lotto;
  end if;
  while fatti < p_quanti loop
    b := uuid_send(gen_random_uuid());             -- 16 byte casuali, senza dipendere da pgcrypto (byte 6 e 8 hanno bit fissi: si saltano)
    nuovo := '';
    for i in 0..9 loop
      nuovo := nuovo || substr(alfabeto, 1 + (get_byte(b, case when i < 6 then i else i + 3 end) % length(alfabeto)), 1);
    end loop;
    insert into public.codici (codice, lotto) values (nuovo, p_lotto) on conflict do nothing;
    if found then
      fatti := fatti + 1;
      return next substr(nuovo, 1, 5) || '-' || substr(nuovo, 6, 5);
    end if;
  end loop;
end;
$$;

-- sgancia_codice('XXXXX-XXXXX') → chi ha cambiato telefono o cancellato i dati può riusarlo
create or replace function public.sgancia_codice(p_codice text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.codici set dispositivo = null, usato_il = null
   where codice = translate(upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g')), 'OIL', '011');
$$;

revoke all on function public.genera_codici(text, int), public.sgancia_codice(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ giocatori (fase 2: i progressi nel database)

-- Pronta ma ancora senza accesso dal gioco. Quando la accendi: login anonimo di Supabase + policy "ognuno vede solo la
-- propria riga" (auth.uid() = id). Il consenso marketing sta in una tabella a parte, così si cancella da solo.
create table if not exists public.giocatori (
  id            uuid primary key,               -- coincide con il dispositivo / l'utente anonimo
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  passo         text,                           -- ultimo passo della storia (STORIA.passi)
  progressi     jsonb not null default '{}'::jsonb,   -- soldi, idee, punteggi, scelte
  plus          text[] not null default '{}'    -- lotti sbloccati
);

create table if not exists public.contatti (
  giocatore     uuid primary key references public.giocatori (id) on delete cascade,
  contatto      text not null,                  -- email o handle
  consenso_il   timestamptz not null,           -- quando ha detto sì
  testo_consenso text not null                  -- la formula esatta che ha accettato
);

alter table public.giocatori enable row level security;
alter table public.contatti  enable row level security;
revoke all on public.giocatori, public.contatti from anon, authenticated;

-- ------------------------------------------------------------------ esempio d'uso (SQL editor)
-- insert into public.lotti (id, descrizione) values ('jukebox-cinema', 'Jukebox a ritmo: Cinema'), ('jukebox-blackbox', 'Jukebox a ritmo: Black Box');
-- select * from public.genera_codici('jukebox-cinema', 50);       -- copia l'elenco, poi: update codici set assegnato_a = '@handle' where codice = '…';
-- select public.riscatta('abcde-fghjk', gen_random_uuid());        -- prova
