# 10 – Chat: sdílení skillu s progressem

## 1. Co bylo uděláno

V chatu je vlevo od pole pro zprávu tlačítko **+**. Přes něj jde poslat do konverzace **kartu skillu** s mým progressem. Funkce je hlavně pro druhého: na kartě vidí, jak na tom jsem, a jedním klikem si skill přidá k sobě.

```
 ┌─────────────────────────────┐
 │ ‹ Share skill progress      │
 │ 🔍 [kyt               ]     │   ← hledání v mých skillech (bez diakritiky)
 │ ▢ Kytara                    │
 │ ▢ Kytara – fingerstyle      │
 └─────────────────────────────┘
 [+] [ Write a message…        ] [➤]
```

```
 Já (odesílatel)                       Druhý (příjemce)
 ┌──────────────────────┐             ┌──────────────────────┐
 │ ▓▓▓ obrázek [LEARNING]│            │ ▓▓▓ obrázek [LEARNING]│  ← status jako štítek v rohu
 │ Kytara               │             │ Kytara               │
 │ Intermediate   ●●○○○ │             │ Intermediate   ●●○○○ │  ← tečka za každý level
 │ Progress        7/12 │             │ Progress        7/12 │
 │ ███████░░░░░         │             │ ███████░░░░░         │
 │ Roky hraní       3   │             │ Roky hraní       3   │
 └──────────────────────┘             │ [ + Add skill ]      │  ← nebo „✓ In your skills“
                                      └──────────────────────┘
```

| Kdo | Co může |
|---|---|
| **odesílatel** | sdílet skill, který má v profilu a je **schválený**; kartu smazat, reagovat, odpovědět na ni. **Upravit ne** (je to snímek) |
| **příjemce** | vidět status, level, progress a atributy; **Add skill** otevře stejný modal jako na stránce Skills |

**Důležité:** karta ukazuje progress **v okamžiku sdílení**, ne živě. Proč, viz kapitola 3.

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `supabase/migrations/20261102001_chat_share_skill.sql` | **nová**: RPC `share_skill`, úprava CHECK pravidla, `delete_message` maže i snímek |
| `apps/web/src/components/chat/ComposerPlusMenu.tsx` | **nový**: tlačítko + → menu → vyhledávací seznam skillů |
| `apps/web/src/components/chat/SkillShareCard.tsx` | **nový**: karta skillu ve zprávě |
| `apps/web/src/components/chat/MessageRow.tsx` | zpráva typu `skill` vykreslí kartu místo bubliny; bez tlačítka Edit |
| `apps/web/src/components/chat/ChatThread.tsx` | načte moje skilly (kvůli „In your skills“), otevírá `AddSkillModal`, předává + menu do composeru |
| `apps/web/src/hooks/useMessages.ts` | nová funkce `shareSkill` |
| `apps/web/src/lib/chat-queries.ts` | typ `SkillShareMetadata`, `shareSkill`, `fetchShareableSkills`, `fetchMySkillIds`, `messagePreview` |
| `apps/web/src/lib/skill-queries.ts` | **nová** `addSkillToProfile` (vytaženo z `AddSkillsView`) |
| `apps/web/src/pages/skills/AddSkillsView.tsx` | používá `addSkillToProfile` místo vlastního kódu |

## 3. Databáze

### Typ `skill` už v tabulce byl

Už v první chat migraci (`20261011001_chat.sql`) měla tabulka `messages` typy `text | image | skill | system` a sloupec `skill_node_id`. Frontend je jen zatím nepoužíval. Nová tabulka tedy nebyla potřeba.

### Proč snímek, a ne živá data

Progress a atributy jsou v tabulkách, které má RLS nastavené „jen vlastník“:

| Tabulka | Co obsahuje | RLS |
|---|---|---|
| `user_progress_checks` | odškrtnuté položky checklistu | `auth.uid() = user_id` |
| `user_skill_level` | zvolený level | `auth.uid() = user_id` |
| `user_skill_attributes` | vyplněné atributy | policy není v našich migracích, bereme je jako osobní data |

Příjemce by tedy moje data **nepřečetl**. Možnosti byly dvě:

1. **Živě:** nová RPC funkce, která vrátí progress odesílatele každému členovi konverzace. Na kartě by byl vždy aktuální stav, ale přibude dotaz za každou kartu a pravidlo „kdo smí vidět cizí progress“.
2. **Snímek (zvoleno):** při sdílení se data spočítají a uloží přímo do zprávy, do sloupce `metadata` (jsonb). Je to jako fotka: ukazuje stav v čase odeslání, což ke zprávě v chatu sedí.

Uložený snímek vypadá takto:

```json
{
  "name": "Kytara",
  "image_url": "https://…",
  "status": "learning",
  "level": { "name": "Intermediate", "rank": 2, "total": 5 },
  "progress": { "done": 7, "total": 12 },
  "attributes": [{ "label": "Roky hraní", "unit": null, "value": 3 }]
}
```

Jméno a obrázek jsou ve snímku taky. Karta se tak vykreslí jen ze zprávy, bez dalšího dotazu, a funguje i z Realtime payloadu (ten obsahuje jen sloupce řádku).

### Proč RPC, a ne obyčejný INSERT

Klient do `metadata` **nesmí** zapisovat. Grant z první migrace to nedovoluje:

```sql
GRANT INSERT (id, conversation_id, sender_id, type, body, image_path, skill_node_id)
  ON public.messages TO authenticated;     -- metadata v seznamu není
```

Kdyby mohl, poslal by si do chatu „Level 5/5, 12/12“ bez ohledu na skutečnost. Proto snímek počítá **server** ve funkci `share_skill(p_conversation_id, p_skill_node_id)`:

```
share_skill
 ├─ jsem člen konverzace?          ne → 'not_a_member'
 ├─ skill existuje a je approved?  ne → 'skill_not_shareable'
 ├─ mám ho v user_skills?          ne → 'skill_not_in_profile'
 ├─ level:    user_skill_level ⨝ skill_levels  → name, rank, total
 ├─ progress: skill_progress_items ⟕ user_progress_checks → done/total
 ├─ atributy: user_skill_attributes ⨝ skill_attribute_defs → label, unit, value
 └─ INSERT messages (type 'skill', skill_node_id, metadata)  → vrátí id
```

Je `SECURITY DEFINER`, takže běží s právy vlastníka funkce a RLS neplatí. Proto musí členství kontrolovat **sama** (`is_conversation_member`). Blokování hlídá dál trigger `tg_messages_before_insert`, ten se spustí při každém INSERTu.

Proč jen **approved** skill: neschválený (`pending`) skill vidí díky RLS jen jeho autor (viz poznámka 08). Příjemce by ho nemohl přidat.

### Úpravy pravidel

- `messages_content_by_type`: u typu `skill` bylo `metadata IS NULL`, teď `metadata IS NOT NULL`. CHECK se nedá upravit, proto `DROP CONSTRAINT` + `ADD CONSTRAINT`.
- `delete_message` teď nastaví i `metadata = NULL`. Smazaná zpráva nesmí držet obsah, a snímek obsah je.

### Pár SQL triků z `share_skill`

```sql
-- pořadí levelu: kolik levelů má sort_order <= můj → 2. z 5
'rank', (SELECT count(*) FROM skill_levels x
         WHERE x.skill_node_id = l.skill_node_id AND x.sort_order <= l.sort_order)
```

```sql
-- LEFT JOIN: všechny položky checklistu, odškrtnuté mají c.item_id vyplněné
SELECT count(c.item_id) AS done, count(*) AS total
FROM skill_progress_items i
LEFT JOIN user_progress_checks c ON c.item_id = i.id AND c.user_id = v_me
```

`count(*)` počítá řádky, `count(sloupec)` jen ty, kde sloupec **není NULL**. U neodškrtnutých položek je `c.item_id` NULL, takže `count(c.item_id)` = počet odškrtnutých.

```sql
coalesce(jsonb_agg(… ORDER BY d.sort_order), '[]'::jsonb)
```

`jsonb_agg` složí řádky do JSON pole. Když žádné řádky nejsou, vrátí `NULL`, proto `coalesce` na prázdné pole. Frontend pak může vždy volat `meta.attributes.length`.

## 4. Jak to funguje ve frontendu

### Tok sdílení

```
ComposerPlusMenu ─(klik na skill)→ onShareSkill(id)
  └ ChatThread předá shareSkill z useMessages
      └ useMessages.shareSkill → chat-queries.shareSkill
          ├ supabase.rpc('share_skill') → id nové zprávy
          └ fetchMessage(id) → celá zpráva → appendUnique do seznamu
```

Zpráva se do seznamu přidá hned. Druhá kopie z Realtime se zahodí díky `appendUnique` (stejné `id`), stejně jako u textových zpráv.

### Tok přidání skillu

```
SkillShareCard [Add skill]
  └ ChatThread.openAddSkill(m)
      ├ fetchSkillById(m.skill_node_id)   ← plný SkillNode (show_creator, created_by…)
      └ setAdding(node) → <AddSkillModal>
          └ onConfirm → addSkillToProfile(...) + přidat id do mySkillIds
```

`AddSkillModal` je **stejná komponenta** jako na stránce Skills. Kód pro uložení (`user_skills` + `user_skill_attributes`) byl dřív přímo v `AddSkillsView`. Teď je ve sdílené funkci `addSkillToProfile`, kterou volají obě místa. Kdyby se kód zkopíroval, při změně by se snadno opravil jen na jednom místě.

### „In your skills“

`ChatThread` si při otevření jednou načte `fetchMySkillIds(myId)`: `Set` id všech mých skillů. Každá karta pak jen ověří `mySkillIds.has(skill_node_id)`. Po přidání se Set aktualizuje a karta se hned přepne:

```tsx
setMySkillIds(prev => new Set(prev).add(adding.id))
```

Nový `Set` je nutný: React pozná změnu stavu podle **nové reference**. Kdyby se zavolalo `prev.add(...)` a vrátil se stejný objekt, React by nic nepřekreslil.

### Smazaný skill

`skill_node_id` má `ON DELETE SET NULL`. Když admin skill smaže, zpráva zůstane, snímek taky, jen `skill_node_id` je `null`. Karta pak místo tlačítka ukáže „This skill is no longer available.“

### Odpověď na kartu

Karta nemá `body`, takže náhled odpovědi by byl prázdný. Proto nová funkce:

```ts
export function messagePreview(m) {
  if (m.type === 'skill' && m.metadata) return `Shared skill: ${m.metadata.name}`
  return m.body ?? ''
}
```

Používá se v náhledu nad odpovědí (`MessageRow`) i v liště „Replying to…“ nad polem pro psaní (`Composer`). Aby to fungovalo, embed `reply_to` v `MESSAGE_COLUMNS` teď načítá i `type` a `metadata`.

## 5. React a TypeScript syntaxe

### Jeden stav místo několika booleanů

```tsx
const [view, setView] = useState<'closed' | 'menu' | 'skills'>('closed')
```

Menu může být zavřené, otevřené, nebo ukazovat seznam skillů. Se dvěma booleany (`menuOpen`, `pickerOpen`) by šel nastavit nesmyslný stav „obojí true“. S jedním stavem, který má tři hodnoty, to nejde.

### Union typ pro `metadata`

```ts
metadata: SystemMetadata | SkillShareMetadata | null
```

Jeden sloupec, dva tvary podle `type`. Na místě použití se typ upřesní přes `as`:

```tsx
const meta = message.metadata as SkillShareMetadata   // v SkillShareCard
systemText(m.metadata as SystemMetadata, …)           // u systémových zpráv
```

`as` TypeScriptu říká „věř mi“, nic nekontroluje za běhu. Je to bezpečné jen proto, že se karta vykresluje jen pro `type === 'skill'`.

### Podmíněné vykreslení se třemi větvemi

```tsx
{!mine && (
  hasSkill ? <p>✓ In your skills</p>
  : available ? <button>Add skill</button>
  : <p>This skill is no longer available.</p>
)}
```

Vnořený ternární operátor: `a ? X : b ? Y : Z`. Celé je v `!mine && (…)`, takže odesílatel nevidí nic z toho.

### Vyhledávání bez diakritiky

```ts
s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
```

`NFD` rozloží „á“ na „a“ + samostatnou čárku. Regex `\p{Diacritic}` (flag `u` = Unicode) čárky a háčky odstraní. Hledání „kyt“ pak najde „Kytára“. Výsledek se počítá v `useMemo` jen při změně seznamu nebo dotazu.

### `e.stopPropagation()` na tlačítku v kartě

Klepnutí na řádek zprávy na mobilu otevírá toolbar (`onActivate`). Bez `stopPropagation` by klik na **Add skill** zároveň otevřel toolbar.

### Funkce jako prop, která vrací `Promise`

```tsx
onAdd: () => Promise<void>
…
const add = async () => {
  setOpening(true)
  try { await onAdd() } finally { setOpening(false) }
}
```

Karta neví, co se po kliknutí děje (načtení skillu, otevření modalu). Jen počká, až to doběhne, a mezitím tlačítko zakáže (`disabled={opening}`), aby se nedalo kliknout dvakrát. `finally` se spustí i při chybě.

## 6. Tailwind použitý v této funkci

| Třídy | Co dělají |
|---|---|
| `absolute bottom-full left-0 mb-2` | menu se otevře **nad** tlačítkem (`bottom-full` = spodní hrana na 100 % výšky rodiče) |
| `rotate-45` | + se při otevřeném menu otočí na × |
| `bg-linear-to-t from-black/70 to-transparent` | ztmavení spodku obrázku, aby byl bílý název čitelný |
| `h-1.5 overflow-hidden rounded-full` + vnitřní `div` se `style={{ width: … }}` | progress bar: šířka je dynamická, proto `style`, ne Tailwind třída |
| `bg-linear-to-r from-indigo-600 to-fuchsia-600` | stejný gradient jako moje bubliny zpráv |
| `max-h-64 overflow-y-auto` | seznam skillů se při velkém počtu scrolluje |
| `rounded-br-md` / `rounded-bl-md` | „ocásek“ karty na straně odesílatele, stejně jako u bublin |

Proč šířka progress baru přes `style`: Tailwind generuje jen třídy, které najde v kódu jako text. `w-[58%]` poskládané za běhu by v CSS nebylo.

## 7. Jak otestovat

1. **Spustit migraci** `20261102001_chat_share_skill.sql` v SQL editoru Supabase. Bez ní sdílení skončí chybou (funkce `share_skill` neexistuje).
2. Jako uživatel A otevřít chat s B → **+** → **Share skill progress** → najít skill → kliknout. Karta se objeví hned.
3. U B (jiný prohlížeč) se karta objeví bez obnovení stránky (Realtime). Má tlačítko **Add skill**.
4. B klikne **Add skill** → modal → potvrdit. Karta se přepne na „✓ In your skills“. Skill je v B → Skills → My skills i s atributy.
5. A změní progress (odškrtne položku) → stará karta se **nezmění**, nové sdílení ukáže nový stav.
6. A najede na svou kartu → toolbar nemá **Edit**. Delete kartu smaže.
7. B odpoví na kartu → náhled ukazuje „Shared skill: …“.
8. Skill ve stavu *Pending review* se v seznamu pro sdílení neobjeví.

## 8. Nové pojmy

| Pojem | Význam |
|---|---|
| **snímek (snapshot)** | kopie dat k určitému okamžiku, později se nemění |
| **column-level GRANT** | právo zapisovat jen do vyjmenovaných sloupců tabulky |
| **SECURITY DEFINER** | funkce běží s právy vlastníka, RLS se neuplatní, kontroly musí dělat sama |
| **jsonb_agg** | agregace řádků do JSON pole |
| **LEFT JOIN + count(sloupec)** | spočítá jen řádky, které ve druhé tabulce mají protějšek |
| **ON DELETE SET NULL** | po smazání odkazovaného řádku se cizí klíč nastaví na NULL místo smazání zprávy |
| **Unicode normalizace (NFD)** | rozklad znaku s diakritikou na základní písmeno + znaménko |

## 9. Kontrolní otázky

1. Proč příjemce nemůže progress odesílatele načíst přímo z `user_progress_checks`?
2. Co by se stalo, kdyby klient mohl zapsat `metadata` sám?
3. Proč musí `share_skill` kontrolovat členství, i když tabulka `messages` má INSERT policy, která to dělá?
4. Proč jde sdílet jen schválený skill?
5. Co vrátí `jsonb_agg`, když nejsou žádné řádky, a proč je kolem `coalesce`?
6. Proč se po přidání skillu volá `new Set(prev).add(id)`, a ne jen `prev.add(id)`?
7. Proč je kód pro uložení skillu ve sdílené funkci `addSkillToProfile`?
8. Proč menu používá jeden stav `'closed' | 'menu' | 'skills'` místo dvou booleanů?
