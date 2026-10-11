-- ════════════════════════════════════════════════════════════════
-- Ruční ověření RLS chatu (migrace 20261011001_chat.sql)
-- ════════════════════════════════════════════════════════════════
-- JAK NA TO
--   1. V Supabase → Authentication → Users vytvoř 3 testovací účty:
--        chat-a@test.cz, chat-b@test.cz, chat-c@test.cz
--   2. Spusť blok 0 a zkopíruj si jejich UUID.
--   3. V tomhle souboru nahraď (Ctrl+H) UUID_A, UUID_B, UUID_C.
--   4. Spouštěj bloky JEDEN PO DRUHÉM: označ blok myší → Run (Ctrl+Enter).
--      Po bloku 1 nahraď ještě CONV_ID a po bloku 2 MSG_ID.
--
-- JAK FUNGUJE "PŘEPNUTÍ NA UŽIVATELE"
--   set local role authenticated   → dotaz běží jako přihlášený uživatel (RLS platí)
--   set local request.jwt.claims   → auth.uid() vrátí zadané UUID
--   "local" = platí jen pro tento jeden běh, pak se vše vrátí zpět.
-- ════════════════════════════════════════════════════════════════


-- ── Blok 0: zjisti UUID testovacích uživatelů (běží jako admin) ──
select id, email from auth.users where email like 'chat-_@test.cz' order by email;


-- ── Blok 1: A založí skupinu a pozve B ──────────────────────────
-- OČEKÁVÁM: vrátí UUID nové konverzace → zkopíruj ho jako CONV_ID
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
select public.create_group_conversation('RLS test skupina', array['UUID_B']::uuid[]) as conv_id;


-- ── Blok 2: A pošle textovou zprávu ─────────────────────────────
-- OČEKÁVÁM: 1 řádek, edited_at = NULL → zkopíruj id jako MSG_ID
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
insert into public.messages (conversation_id, type, body)
values ('CONV_ID', 'text', 'Ahoj, tohle je test')
returning id, sender_id, edited_at;


-- ── Blok 3: B (pending) vidí žádost, ale NE zprávy ──────────────
-- OČEKÁVÁM: konverzace = 1, ucastnici = 2, zpravy = 0
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_B","role":"authenticated"}';
select
  (select count(*) from public.conversations             where id = 'CONV_ID')              as konverzace,
  (select count(*) from public.conversation_participants where conversation_id = 'CONV_ID') as ucastnici,
  (select count(*) from public.messages                  where conversation_id = 'CONV_ID') as zpravy;


-- ── Blok 4: B (pending) nesmí psát ──────────────────────────────
-- OČEKÁVÁM: CHYBA "new row violates row-level security policy"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_B","role":"authenticated"}';
insert into public.messages (conversation_id, type, body)
values ('CONV_ID', 'text', 'Píšu bez schválení');


-- ── Blok 5: B přijme žádost a vidí zprávy ───────────────────────
-- OČEKÁVÁM: zprávy A + systémové (group_created, member_joined)
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_B","role":"authenticated"}';
select public.accept_conversation('CONV_ID');
select type, body, metadata->>'event' as udalost, created_at
from public.messages where conversation_id = 'CONV_ID' order by created_at;


-- ── Blok 6: C (cizí uživatel) nevidí NIC ────────────────────────
-- OČEKÁVÁM: 0, 0, 0
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_C","role":"authenticated"}';
select
  (select count(*) from public.conversations             where id = 'CONV_ID')              as konverzace,
  (select count(*) from public.conversation_participants where conversation_id = 'CONV_ID') as ucastnici,
  (select count(*) from public.messages                  where conversation_id = 'CONV_ID') as zpravy;


-- ── Blok 7: C nesmí poslat zprávu do cizí konverzace ────────────
-- OČEKÁVÁM: CHYBA "new row violates row-level security policy"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_C","role":"authenticated"}';
insert into public.messages (conversation_id, type, body)
values ('CONV_ID', 'text', 'Vloupal jsem se');


-- ── Blok 8: C se nesmí sám přidat do skupiny ────────────────────
-- OČEKÁVÁM: CHYBA "insufficient_privileges"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_C","role":"authenticated"}';
select public.add_conversation_members('CONV_ID', array['UUID_C']::uuid[]);


-- ── Blok 9: C nesmí zapisovat do tabulky účastníků napřímo ──────
-- OČEKÁVÁM: CHYBA "permission denied for table conversation_participants"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_C","role":"authenticated"}';
insert into public.conversation_participants (conversation_id, user_id, status)
values ('CONV_ID', 'UUID_C', 'accepted');


-- ── Blok 10: B (obyčejný člen) nesmí přejmenovat skupinu ────────
-- OČEKÁVÁM: CHYBA "insufficient_privileges"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_B","role":"authenticated"}';
select public.rename_conversation('CONV_ID', 'Hacknutý název');


-- ── Blok 11: B nesmí upravit cizí zprávu ────────────────────────
-- OČEKÁVÁM: 0 řádků (RLS řádek "neukáže", takže se nic nezmění)
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_B","role":"authenticated"}';
update public.messages set body = 'Přepsáno cizím' where id = 'MSG_ID'
returning id;


-- ── Blok 12: A upraví svou zprávu → edited_at se vyplní sám ─────
-- OČEKÁVÁM: 1 řádek, edited_at = teď
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
update public.messages set body = 'Ahoj, upravená zpráva' where id = 'MSG_ID'
returning body, edited_at;


-- ── Blok 13: A nesmí změnit nic jiného než text ─────────────────
-- OČEKÁVÁM: CHYBA "permission denied for table messages"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
update public.messages set created_at = '2000-01-01' where id = 'MSG_ID';


-- ── Blok 14: B nesmí smazat cizí zprávu ─────────────────────────
-- OČEKÁVÁM: CHYBA "message_not_found_or_not_yours"
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_B","role":"authenticated"}';
select public.delete_message('MSG_ID');


-- ── Blok 15: A smaže svou zprávu (měkce) ────────────────────────
-- OČEKÁVÁM: body = NULL, deleted_at vyplněno
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
select public.delete_message('MSG_ID');
select body, deleted_at from public.messages where id = 'MSG_ID';


-- ── Blok 16: 1:1 chat – druhé volání vrátí STEJNOU konverzaci ───
-- OČEKÁVÁM: prvni = druhy
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
select public.get_or_create_direct_conversation('UUID_C') as prvni,
       public.get_or_create_direct_conversation('UUID_C') as druhy;


-- ── Blok 17: odchod vlastníka → vlastnictví přejde na B ─────────
-- OČEKÁVÁM: B má roli owner
set local role authenticated;
set local request.jwt.claims to '{"sub":"UUID_A","role":"authenticated"}';
select public.leave_conversation('CONV_ID');
reset role;
select user_id, role, status from public.conversation_participants where conversation_id = 'CONV_ID';


-- ── Blok 18: ÚKLID (běží jako admin) ────────────────────────────
delete from public.conversations
where title = 'RLS test skupina'
   or direct_key in (
     least('UUID_A', 'UUID_C') || ':' || greatest('UUID_A', 'UUID_C')
   );
