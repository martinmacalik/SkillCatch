# 21 – Teach jako třída: úkoly, odevzdání, hodnocení

Navazuje na [15](15-teach-ucitelska-licence.md), [16](16-teach-instituce-tituly-overeni.md) a [17 – databáze, schvalování, dashboard](17-teach-databaze-schvalovani-dashboard.md). Vazba učitel–žák (`teacher_students`), notifikace z triggerů a privátní bucket se signed URL jsou popsané tam a v [08](08-vlastni-skilly-schvalovani-oznameni.md). Tady jsou hlavně **nové** věci:

- RLS jen pro čtení, všechny zápisy přes RPC
- stav, který se odvozuje z chybějícího řádku
- `FOR UPDATE` proti dvojitému odeslání
- storage policies sestavené z cesty
- nahrání souboru dřív, než existuje řádek
- modal řízený parametrem v URL

Návrh: [spec](../superpowers/specs/2026-11-27-teach-classroom-design.md) · plán: [plan](../superpowers/plans/2026-11-27-teach-assignments.md)

## 1. Co bylo uděláno

```
UČITEL (Teach)                                  ŽÁK (Learn → pravý panel)
┌ Your classes ───────────────────┐             ┌ YOUR TEACHER ──────────────────┐
│ [Guitar · 8 students ● 3 review]│──klik──┐    │ (foto) Jan Novák        [Chat] │
│ [Piano  · 2 students           ]│        │    │ Assignments                    │
└─────────────────────────────────┘        │    │  ↺ Rhythm 4/4  Returned·fix it │
                                           ▼    │  ◉ Chords      Due Fri 29 Nov  │
/dashboard/teach/class/:skillId                 │  ○ Tuning      Submitted       │
  [Assignments] [Students]   [+ New assignment] │  Show done (4)                 │
  Chords G–C–D   3/8 submitted · 2 to review    └────────────────────────────────┘
        └─klik─► detail: žáci + stav | vlákno žáka [Return] [Mark done]
```

- **Třída = učitel + skill.** Nikde se nezakládá. Je to prostě množina žáků, kteří mají v `teacher_students` stav `active` pro tento skill.
- **Úkol** má název, zadání, přílohy (soubor nebo odkaz), volitelný termín a adresáty: celou třídu, nebo vybrané žáky.
- **Koloběh:** žák odevzdá → učitel úkol **Mark done**, nebo **Return** s povinným komentářem → žák opraví a odevzdá znovu → … Do vlákna můžou kdykoli psát komentáře obě strany.
- **Žák nikdy neuvidí, že je ve třídě.** Widget mluví jen o „your teacher“, nikde se neobjeví počty ani jména ostatních žáků.
- **Notifikace:** nový úkol, odevzdáno, ohodnoceno a komentář. Odkaz v notifikaci otevře rovnou daný úkol.

## 2. Nové a změněné soubory

| Soubor | Co dělá |
|---|---|
| [20261127001_teach_assignments.sql](../../supabase/migrations/20261127001_teach_assignments.sql) | 4 tabulky, RLS jen pro čtení, RPC pro zápisy, bucket `teach-files` a jeho policies |
| [lib/teach-assignments-queries.ts](../../apps/web/src/lib/teach-assignments-queries.ts) | typy, volání RPC, nahrávání souborů, signed URL, popisky stavů |
| [lib/links.ts](../../apps/web/src/lib/links.ts) | `normalizeUrl`, `youtubeId` a `hostOf`, vytažené z profile-blocks, aby je sdílely profil i Teach |
| [components/teach/assignments/](../../apps/web/src/components/teach/assignments/) | `SubmissionThread` (srdce koloběhu), `AttachmentEditor` a `AttachmentList`, `AssignmentFormModal`, `AssignmentDetailModal`, `Modal` |
| [pages/TeachClassPage.tsx](../../apps/web/src/pages/TeachClassPage.tsx) | stránka třídy se záložkami Assignments a Students |
| [dashboard/ClassesSection.tsx](../../apps/web/src/components/teach/dashboard/ClassesSection.tsx) | karty tříd na Teach |
| [learn/TeachersWidget.tsx](../../apps/web/src/components/learn/TeachersWidget.tsx), [YourTeacherCard.tsx](../../apps/web/src/components/learn/YourTeacherCard.tsx), [StudentAssignmentModal.tsx](../../apps/web/src/components/learn/StudentAssignmentModal.tsx) | strana žáka |

## 3. Datový model: čtyři tabulky

```
teach_assignments ──< teach_assignment_students   (jen když audience = 'students')
        │
        └──< teach_submissions ──< teach_submission_entries
             (1 řádek na žáka a úkol)  (vlákno: submission | review | comment)
```

### Stav „nezačato“ = chybějící řádek

`teach_submissions.status` zná jen `submitted`, `returned` a `done`. Stav **nezačato** se neukládá. Znamená, že pro dvojici úkol + žák řádek **neexistuje**:

```sql
coalesce(s.status, 'not_started')   -- LEFT JOIN na submissions, NULL = nic neodevzdal
```

Proč neukládat i nezačato:
- Úkol pro „celou třídu“ by musel při vytvoření založit řádek každému žákovi.
- Pro nováčka, který do třídy přijde později, by ho musel založit trigger na `teacher_students`.
- Žák odebraný z úkolu by po sobě nechával prázdné řádky.

Když je stav odvozený z toho, že řádek chybí, nic z toho řešit nemusíme.

### „Po termínu“ se počítá, neukládá

```sql
a.due_at < coalesce(s.first_submitted_at, now())     -- rozhoduje PRVNÍ odevzdání
AND joined_at < a.due_at                             -- nováček po termínu není „late“
```

Proto má tabulka dva časy: `first_submitted_at` (pro „late“) a `submitted_at` (poslední odevzdání). Kdo odevzdal včas a opravu poslal po termínu, nebude označený jako „late“.

### Vlákno jen přidává

`teach_submission_entries` se nikdy neupravuje ani nemaže. Každé odevzdání, hodnocení i komentář je nový řádek. Díky tomu má učitel i žák celou historii („vráceno: chybí refrén“ → nová verze → „super, hotovo“). Kontrola v tabulce hlídá, že `decision` vyplní jen hodnocení:

```sql
CHECK ((kind = 'review') = (decision IS NOT NULL))
```

Porovnávají se dvě pravdivostní hodnoty: „je to review“ musí platit právě tehdy, když je vyplněné `decision`.

## 4. RLS jen pro čtení, zápisy jen přes RPC

V [17](17-teach-databaze-schvalovani-dashboard.md) mohl klient do `teacher_students` zapisovat přímo a přechody stavů hlídal trigger. Tady je to přísnější: **tabulky nemají žádnou policy pro INSERT, UPDATE ani DELETE.** RLS povolí jen SELECT, takže jakýkoli `supabase.from('teach_submissions').insert(...)` z prohlížeče skončí chybou.

Všechny zápisy jdou přes funkce `SECURITY DEFINER`:

| RPC | Kdo | Co kontroluje |
|---|---|---|
| `create_assignment` / `update_assignment` | učitel | skill je na schválené licenci, vybraní žáci jsou opravdu jeho aktivní žáci v tomto skillu |
| `submit_assignment` | žák | je adresát úkolu, odevzdání není prázdné, úkol ještě není `done` ani nečeká na hodnocení |
| `review_submission` | učitel úkolu | stav je `submitted`, žák je pořád adresát, `returned` má komentář |
| `comment_submission` | obě strany | žák je pořád adresát (odejitý žák = vlákno jen ke čtení) |

**Proč takhle, a ne trigger:** jeden krok tu mění víc věcí najednou. Odevzdání mění stav, přidá záznam do vlákna a pošle notifikaci. V jedné funkci proběhne celé, nebo vůbec (je to jedna transakce). Přes přímé INSERTy z klienta by šlo poslat třeba jen změnu stavu bez záznamu.

Notifikace zakládá pomocná funkce `_teach_notify` přímo v RPC. V [08](08-vlastni-skilly-schvalovani-oznameni.md) to dělal trigger. Tady RPC ví víc, třeba kdo je „ta druhá strana“, takže je to jednodušší.

### Pomocné funkce s podtržítkem

```sql
REVOKE EXECUTE ON FUNCTION public._teach_student_in_assignment(uuid, uuid) FROM PUBLIC, anon, authenticated;
```

`_teach_*` funkce volají jen jiné funkce, nikdy klient. Nemají `GRANT` pro `authenticated`, takže je přes `supabase.rpc()` nikdo nezavolá. Fungují uvnitř jiných `SECURITY DEFINER` funkcí, protože ty běží pod vlastníkem. Výjimkou je `can_see_assignment`: tu volají RLS policies a ty běží pod přihlášeným uživatelem, proto ji `authenticated` spouštět smí.

## 5. `FOR UPDATE`: dvojklik na Submit

Žák dvakrát rychle klikne na **Submit**. Bez zámku by obě volání přečetla stav „returned“, obě by prošla kontrolou a vznikla by dvě odevzdání. Řešení:

```sql
INSERT INTO teach_submissions (...) VALUES (...)
ON CONFLICT (assignment_id, student_id) DO NOTHING;   -- řádek určitě existuje

SELECT * INTO s FROM teach_submissions
WHERE assignment_id = … AND student_id = … FOR UPDATE; -- zamkni ho

IF s.status = 'done' THEN RAISE EXCEPTION 'already done'; END IF;
```

`FOR UPDATE` zamkne řádek až do konce transakce. Druhé volání na tomhle `SELECT` počká, a když se dočká, uvidí už nový stav `submitted` se záznamem ve vlákně, takže skončí chybou „already submitted“. Tomu se říká **serializace přes zámek řádku**. Stejně funguje `review_submission`, kde `FOR UPDATE OF sub` zamyká jen tabulku odevzdání, ne připojený úkol.

## 6. Storage policies podle cesty k souboru

Bucket `teach-files` je privátní a o přístupu rozhoduje **cesta**:

```
{assignment_id}/teacher/{soubor}       ← přílohy učitele
{assignment_id}/{student_id}/{soubor}  ← soubory žáka
```

Policy si cestu rozebere přes `split_part(name, '/', n)`:

- **čtení:** učitel úkolu cokoli ve složce úkolu; žák složku `teacher/` a svou vlastní složku (a jen když je adresát)
- **nahrání:** do `teacher/` jen učitel; do `{uid}/` jen ten žák
- **mazání:** jen učitel, aby žák nerozbil historii vlákna

První segment se převádí na uuid **bezpečně**:

```sql
CASE WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-…$' THEN split_part(p_name, '/', 1)::uuid END
```

Bez regexu by soubor s cestou `nesmysl/x.png` shodil celou policy chybou převodu (`invalid input syntax for type uuid`). S regexem dostane `NULL` a přístup se prostě zamítne.

## 7. Nahrát soubor dřív, než existuje úkol

Učitel ve formuláři nového úkolu přidá PDF. Soubor má ležet v `{assignment_id}/teacher/`, jenže úkol ještě neexistuje, protože ho vytvoří až tlačítko **Assign**. Řešení: **id vygeneruje klient** hned při otevření formuláře.

```ts
const [id] = useState(() => initial?.id ?? newAssignmentId())   // crypto.randomUUID()
// … upload do `${id}/teacher/…` …
await createAssignment(id, skillNodeId, input)                   // RPC dostane p_id
```

Storage policy proto pro složku `teacher/` povolí i id úkolu, který ještě neexistuje (pokud má nahrávající schválenou licenci). Číst takový soubor smí jen ten, kdo ho nahrál (`owner_id`).

`useState(() => …)` s funkcí zajistí, že se uuid vygeneruje **jen jednou** za život formuláře, ne při každém renderu.

RPC navíc přílohy znovu přefiltruje (`_teach_clean_attachments`). Soubor musí ležet ve vlastní složce volajícího a odkaz musí být `^https?://`. Klientovi se nevěří, ani když posílá JSON.

## 8. Mazání úkolu: pořadí kroků

SQL samo soubory ve storage smazat neumí. Navíc delete policy potřebuje, aby úkol **ještě existoval**, jinak nepozná, že jsi jeho učitel. Proto klient maže ve dvou krocích:

```ts
const paths = await rpc('assignment_file_paths', { p_id })   // 1. seznam souborů
await storage.from('teach-files').remove(paths)               // 2. smaž soubory (úkol ještě existuje)
await rpc('delete_assignment', { p_id })                      // 3. smaž řádek → kaskáda odevzdání
```

## 9. Modal řízený parametrem v URL

Detail úkolu se otevře, když je v adrese `?assignment=<id>`:

```ts
const [params, setParams] = useSearchParams()
const openId = params.get('assignment')
// …
{openId && <StudentAssignmentModal key={openId} assignmentId={openId} … />}
```

Výhody:
- **Odkaz z notifikace** je obyčejná adresa (`/dashboard/learn/<skill>?assignment=<id>`) a modal se otevře sám.
- Tlačítko **Zpět** v prohlížeči modal zavře.
- `key={openId}` zajistí, že když se otevře jiný úkol, komponenta se namontuje znovu s čistým stavem.

Při změně parametru se ostatní parametry (třeba `?tab=` stránky Learn) zachovají, protože se kopírují přes `new URLSearchParams(p)`.

## 10. Lint pravidlo `set-state-in-effect` a „verze“ pro znovunačtení

Vzor `useCallback(async load) + useEffect(() => { void load() })` lint (React Compiler) občas označí jako setState přímo v efektu. Spolehlivě projde tenhle vzor:

```ts
const [version, setVersion] = useState(0)
const reload = () => setVersion(v => v + 1)

useEffect(() => {
  let alive = true
  fetchX().then(x => { if (alive) setX(x) })
  return () => { alive = false }      // odpověď po odchodu ze stránky se zahodí
}, [id, version])
```

- `setState` se volá jen v `.then`, tedy asynchronně.
- Znovunačtení po akci je jen `reload()`, které změní závislost efektu.
- `alive` řeší pomalou odpověď, která dorazí, když už uživatel přepnul jinam.

## 11. Co dál

- **Fáze 2:** knihovna materiálů (bloky jako na Learn, opakované použití, přikládání k úkolům). `attachments` už počítá s `{kind:'material'}`.
- **Fáze 3:** XP za splněný úkol (`award_xp`), připomínka termínu (pg_cron), tabulka žáci × úkoly.
