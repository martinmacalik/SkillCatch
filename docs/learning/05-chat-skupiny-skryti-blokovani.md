# 05 – Chat: skupiny, skrytí chatu, blokování (+ drobné úpravy UI)

## 1. Co bylo uděláno

V hlavičce otevřeného chatu jsou vpravo nová tlačítka:

| Ikona | Kde | Co udělá |
|---|---|---|
| 👤+ `UserPlus` | chat 1:1 | otevře výběr lidí → **vznikne nová skupina** (já + ten druhý + vybraní), přepne mě do ní; původní chat 1:1 zůstane |
| 👤+ `UserPlus` | skupina (jen owner/admin) | vybraní lidé se **pozvou do této skupiny** |
| 🚫 `Ban` | chat 1:1 | **zablokovat** / odblokovat (červená ikona = je zablokovaný) |
| 🗑️ `Trash2` | chat 1:1 | **skrýt chat** z mého seznamu |
| ↪️ `LogOut` | skupina | **odejít** ze skupiny |

- Každé tlačítko kromě přidání má **potvrzovací popup** (Cancel / potvrdit). U přidání je potvrzením tlačítko v okně výběru.
- **Skrytí**: chat zmizí jen mně, druhý nic nepozná. Vrátí se, když přijde nová zpráva nebo když ho otevřu přes „New chat“. Historie zůstane.
- **Blokování**: v chatu 1:1 nemůže psát nikdo z nás. Místo pole pro psaní je „You blocked this user.“ + Unblock, druhý vidí „This user has blocked you.“. Zablokovaný mi nemůže poslat novou žádost o chat a nejde ho pozvat do skupiny. Ve společné skupině se blok neprojeví.
- **Skupiny** se teď zobrazují v seznamu (ikona lidí, název, počet členů), u cizích zpráv je jméno odesílatele a systémové zprávy („Adam joined the group“) jsou šedý text uprostřed.

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `supabase/migrations/20261024001_chat_groups_hide_block.sql` | tabulky `hidden_conversations`, `user_blocks`, RPC `hide_conversation` / `block_user` / `unblock_user`, kontrola bloku v triggeru a v RPC |
| `apps/web/src/lib/chat-queries.ts` | `fetchConversations` načítá i skupiny, skryté chaty a bloky; nové funkce `createGroup`, `addGroupMembers`, `leaveGroup`, `hideConversation`, `blockUser`, `unblockUser`; `conversationName`; sloupec `metadata` |
| `apps/web/src/components/chat/ChatHeader.tsx` | **nový** – hlavička chatu s tlačítky |
| `apps/web/src/components/chat/ConfirmButton.tsx` | **nový** – ikona, která se nejdřív zeptá |
| `apps/web/src/components/chat/AddPeopleModal.tsx` | **nový** – hledání + výběr více lidí |
| `apps/web/src/hooks/usePeopleSearch.ts` | **nový** – hledání lidí s debounce (sdílí ho `NewChatModal` i `AddPeopleModal`) |
| `apps/web/src/components/chat/ChatAvatar.tsx` | `ConversationAvatar` – osoba, nebo ikona skupiny |
| `apps/web/src/components/chat/ChatThread.tsx` | používá `ChatHeader`, jména ve skupině, systémové zprávy, hláška o bloku |
| `apps/web/src/components/chat/ConversationList.tsx` | skupiny v seznamu |
| `apps/web/src/pages/ChatsPage.tsx` | objekt `actions` – co se má po kliknutí opravdu stát |
| `apps/web/src/hooks/useConversations.ts` | realtime odběr `user_blocks` |
| `docs/database.md` | popis nových tabulek a funkcí |

## 3. Databáze

### Skupiny už v databázi byly
Při návrhu chatu (poznámka 01) vznikly funkce `create_group_conversation`, `add_conversation_members` a `leave_conversation` i systémové zprávy. Frontend je jen nepoužíval. `fetchConversations` měl `.eq('type', 'direct')`, takže skupiny vůbec nenačetl. **Poučení:** když je backend navržený dopředu, další funkce je hlavně práce ve frontendu.

Název skupiny je v databázi povinný (`CHECK … title IS NOT NULL`). Frontend ho proto složí z křestních jmen všech členů („Adam, Petr, Martin“).

### Skrytí = vlastní tabulka, ne sloupec
```
hidden_conversations (user_id, conversation_id, hidden_at)   PK (user_id, conversation_id)
RLS: SELECT jen user_id = auth.uid()
```
Nabízelo se dát sloupec `hidden_at` do `conversation_participants`. Jenže řádky účastníků vidí přes RLS i **ten druhý člověk**, takže by šlo zjistit „Martin si mě skryl“. Vlastní tabulka s politikou „jen moje řádky“ tohle řeší. **RLS pracuje po řádcích, ne po sloupcích**, proto soukromá data patří do vlastní tabulky.

**Jak se chat „vrátí“?** Nic se nemaže ani nepřepisuje. Frontend porovná:
```ts
hidden_at >= (last_message_at ?? created_at)  → schovat
```
Nová zpráva posune `last_message_at` za `hidden_at` a chat je zpátky. Nepotřebuju žádný trigger, stačí jedno porovnání. „New chat“ volá `get_or_create_direct_conversation` a ten u existujícího chatu můj řádek v `hidden_conversations` smaže.

### Blokování
```
user_blocks (blocker_id, blocked_id, created_at)   PK (blocker_id, blocked_id), CHECK blocker ≠ blocked
RLS: SELECT když jsem blocker NEBO blocked
```
- Řádek vidí **obě strany**, protože zablokovaný potřebuje vědět, že má místo inputu ukázat hlášku.
- Index `(blocked_id)`: PK začíná `blocker_id`, takže otázku „kdo blokuje mě“ neobslouží.

**Kde se blok vynucuje** (frontend je jen „hezky to ukázat“, pravidla musí hlídat databáze):
| Místo | Co udělá |
|---|---|
| trigger `tg_messages_before_insert` | zpráva do chatu 1:1 přes blok → chyba `user_blocked` |
| `get_or_create_direct_conversation` | nový chat přes blok → chyba (existující chat se otevřít dá) |
| `create_group_conversation`, `add_conversation_members` | zablokované lidi tiše přeskočí |

Pomocná funkce `_is_blocked(a, b)` kontroluje blok **oběma směry**. Klient ji volat nemůže (`REVOKE … FROM authenticated`), jinak by si kdokoli mohl ověřit, kdo koho blokuje. Volají ji jen `SECURITY DEFINER` funkce, které běží s právy vlastníka. Proto se trigger změnil na `SECURITY DEFINER`, aby směl číst bloky i druhého účastníka bez ohledu na RLS.

## 4. Jak to funguje krok po kroku

### Načtení seznamu: tři dotazy najednou
```ts
const [convRes, hiddenRes, blocksRes] = await Promise.all([...])
```
Dotazy na sobě nezávisí, takže `Promise.all` je pošle paralelně a nečeká se třikrát po sobě. Pak se pro každou konverzaci spočítá `members`, `myRole`, `blockedByMe`, `blockedMe` a skryté se přeskočí.

### Kdo co dělá: `ChatHeader` × `ChatsPage`
`ChatHeader` jen **ukazuje tlačítka** a ptá se. Co se po potvrzení stane, rozhoduje `ChatsPage` v objektu `actions`:
```ts
hide: async id => { await hideConversation(id); await reload(); navigate('/dashboard/chats') }
```
RPC → obnovit seznam → přesměrovat. Hlavička nemusí vědět nic o routeru ani o seznamu. Objekt je v `useMemo`, aby se nevytvářel při každém renderu znovu.

### `ConfirmButton`
Vlastní stav `open`. Klik na ikonu otevře popup **pod tlačítkem** (`relative` na obalu + `absolute top-full right-0` na popupu, stejný princip jako reakce v rohu bubliny). Klik mimo (`mousedown` na `document` + `ref.contains`) nebo Esc ho zavře. Až po „Confirm“ se zavolá `onConfirm()`. Když selže, popup zůstane otevřený s chybou.

### Systémové zprávy
Databáze ukládá jen **co se stalo**, ne text:
```json
{ "event": "member_added", "actor_id": "…", "target_id": "…" }
```
Text skládá frontend (`systemText()` v `ChatThread`). Když si někdo změní jméno, staré systémové zprávy ukážou nové jméno, a šlo by je i přeložit. Proto se do `ROW_COLUMNS` přidal sloupec `metadata`.

### Jméno odesílatele ve skupině
Jméno se ukáže jen nad **první zprávou z řady** od stejného člověka: porovná se `sender_id` s předchozí zprávou. Kdo už ze skupiny odešel, není v `members` → „Former member“.

### Blok živě
`useConversations` odebírá realtime změny `user_blocks`. Když mě Adam zablokuje, přijde event → `reload()` → `blockedMe = true` → místo composeru se ukáže hláška, bez obnovení stránky.

## 5. Drobné úpravy UI ze stejného dne

| Úprava | Soubor | Princip |
|---|---|---|
| Emoji výběr vedle ikonky, smajlík se změní na ✕ | `MessageRow.tsx` | výběr je normální prvek ve flex řádku, ne `absolute` popup → nic nepřekrývá a neořízne se |
| Lišta u cizích zpráv zrcadlově (😊 hned u bubliny) | `MessageRow.tsx` | pořadí prvků v JSX, ne `flex-row-reverse` (Tab pak jde ve stejném pořadí, jako to vidím) |
| Smazané zprávy se v chatu neukazují | `ChatThread.tsx` | `visible = messages.filter(m => !m.deleted_at)`; ve stavu zůstávají, aby citace odpovědi uměla napsat „Message deleted“ |
| Reakce velké na rohu bubliny | `MessageRow.tsx` | `relative` na bublině + `absolute -bottom-4 -right-2` na reakcích; `drop-shadow` (stín podle tvaru emoji) místo `shadow` (stín obdélníku) |
| Ručička nad všemi tlačítky | `index.css` | Tailwind v4 dává tlačítkům `cursor: default` → jedno pravidlo v `@layer base` |
| Neořezané stíny v seznamu chatů | `ConversationList.tsx` | `overflow-y-auto` ořízne i do stran → `px-4` dovnitř a `-mx-4` ven |

## 6. Nové pojmy

- **RLS je po řádcích**: politika rozhoduje, které řádky vidím, ne které sloupce. Soukromé údaje proto patří do vlastní tabulky.
- **`SECURITY DEFINER` vs `INVOKER`**: definer funkce běží s právy toho, kdo ji vytvořil (obchází RLS), invoker s právy volajícího.
- **Soft hide**: nic se nemaže, stav se dopočítá porovnáním časů.
- **`Promise.all`**: spustí několik nezávislých asynchronních operací naráz a počká na všechny.
- **Oddělení „ukaž“ a „udělej“**: komponenta ukáže tlačítko, rodič dodá funkci, co se má stát (`actions`).
- **Debounce**: hledání se spustí až 250 ms po posledním stisku klávesy, ne při každém písmenu.

## 7. Co si mám sám vyzkoušet a ověřit

1. **Spustit migraci** `20261024001_chat_groups_hide_block.sql` v SQL editoru. **Bez ní se seznam chatů nenačte**, protože frontend se ptá na tabulky `hidden_conversations` a `user_blocks`.
2. Dvě okna (A normálně, B anonymně), A a B mají společný chat 1:1:
   - A: koš → potvrdit → chat A zmizí ze seznamu, B nic nevidí. B napíše zprávu → u A se chat vrátí.
   - A: koš, pak „New chat“ → B → otevře se stejný chat i s historií.
   - A: blokovat → B hned (bez obnovení) vidí „This user has blocked you.“, A vidí „You blocked this user.“ + Unblock. Odblokovat → oba zase píšou.
   - A: 👤+ → vybrat C → vznikne skupina „B, C, A“, A je v ní. B a C ji mají v „Chat requests“ jako pozvánku do skupiny.
   - B přijme → v chatu „B joined the group“. B napíše → u A je nad zprávou jméno B.
   - B: odejít → u ostatních „B left the group“, B skupinu v seznamu nemá.
3. Když je A zablokovaný od B, v okně výběru do skupiny se B nesmí nabídnout.
4. V SQL editoru jako uživatel A: `insert into messages (conversation_id, type, body) values ('ID_CHATU_S_B', 'text', 'ahoj');` při bloku → čekám chybu `user_blocked`.
5. Jako B zkusit `select * from hidden_conversations;` → B nesmí vidět řádky uživatele A.

## 8. Kontrolní otázky

1. Proč je skrytí chatu ve vlastní tabulce, a ne ve sloupci `conversation_participants`?
2. Jak se skrytý chat „vrátí“, když nikde neběží žádný trigger, který by ho odkryl?
3. Proč musí řádek v `user_blocks` vidět i ten, kdo byl zablokovaný?
4. Proč nestačí blok hlídat jen ve frontendu (schovaný input)?
5. Proč klient nesmí volat `_is_blocked()` a jak ji pak může použít trigger?
6. Proč databáze ukládá u systémové zprávy jen `event` a `id`, a ne hotovou větu?
7. Proč `ChatHeader` dostává funkce v `actions`, místo aby sám volal RPC a přesměrovával?
