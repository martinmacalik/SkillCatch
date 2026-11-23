# 17 – Teach: licence v databázi, schvalování v adminu a dashboard učitele

Navazuje na [16-teach-instituce-tituly-overeni.md](16-teach-instituce-tituly-overeni.md). Licence už nežije jen v Reactu: ukládá se do Supabase, schvaluje ji admin a učitel má vlastní dashboard se žáky.

## 1. Co bylo uděláno

```
 UČITEL (web)                     ADMIN (apps/admin)               ŽÁK (web)
┌──────────────────────┐        ┌───────────────────────┐        ┌────────────────────────┐
│ Teach: formulář      │ submit │ Licenses              │        │ stránka skillu         │
│  Save draft / Submit │──────► │ ┌─────────┬─────────┐ │        │  Teachers:             │
│                      │        │ │  New    │  Edits  │ │        │  Mgr. Jana N. [Learn   │
│ Dashboard            │ ◄───── │ └─────────┴─────────┘ │        │               with]    │
│  licence + Edit      │ notifi-│ detail, změny vůči    │        └───────────┬────────────┘
│  Students (žádosti,  │ kace   │ schválené verzi,      │                    │ žádost
│   progress, online,  │        │ Approve / Reject      │                    ▼
│   Chat)              │ ◄──────────────────────────────────────── notifikace „student_request“
│  Materials (brzy)    │
└──────────────────────┘
```

## 2. Datový model: dvě vrstvy

```
teacher_license_submissions          ← co učitel EDITUJE (draft → pending → approved / rejected)
  user_id, kind (new|edit), status, payload (JSON celé licence), rejection_reason …

teacher_licenses                     ← SCHVÁLENÁ verze, kterou vidí ostatní (1 na uživatele)
  license_skills                       skilly
    license_evidence                   důkazy
  educator_verifications               soukromé detaily ověření (e-mail, doklad)
```

**Proč dvě vrstvy?** Kdyby učitel upravoval přímo `teacher_licenses`, každá rozpracovaná změna by byla hned vidět veřejně. Takhle:

- rozpracovaná i čekající úprava je jen v `payload` (JSON snapshot formuláře),
- žáci pořád vidí poslední schválenou verzi,
- admin schválí celou úpravu najednou a funkce `approve_license_submission` ji „vyklopí“ do živých tabulek.

**„Jiný sloupeček“ pro úpravy** = sloupec `kind`. Nastavuje ho trigger `tg_license_submission_fill`: existuje už schválená licence → `edit`, jinak `new`. Klient ho nemůže podvrhnout, i kdyby poslal něco jiného, trigger to přepíše. Admin stránka pak jen rozdělí seznam podle `kind` do dvou sloupců.

**Jedna otevřená žádost na uživatele** hlídá částečný unikátní index:

```sql
CREATE UNIQUE INDEX uq_license_submissions_open
  ON teacher_license_submissions(user_id)
  WHERE status IN ('draft', 'pending');   -- staré approved / rejected se nepočítají
```

## 3. Životní cyklus žádosti

```
            Save draft            Submit             Approve (admin)
 (nic) ──────────────► draft ─────────────► pending ───────────────► approved → živé tabulky
                        ▲  │                  │  │
                        │  └─ Withdraw ─► (smazáno)  └─ Reject ─► rejected (+ důvod)
                        └──── Save draft (stáhne z review) ┘
```

- Učitel smí měnit jen svou žádost a jen ve stavu `draft` / `pending` (RLS `USING` + `WITH CHECK`).
- Pole `reviewed_by`, `reviewed_at`, `rejection_reason` musí zůstat prázdná, takže si učitel nemůže sám nastavit `approved`.
- Schválení a zamítnutí běží přes admin API se **service role**, která RLS obchází.

## 4. Schválení = jedna transakce

`approve_license_submission(p_submission_id, p_actor_user_id)` udělá v jedné transakci:

1. `SELECT … FOR UPDATE` žádosti (dva admini nemůžou schválit současně),
2. `INSERT … ON CONFLICT (user_id) DO UPDATE` do `teacher_licenses`,
3. smaže a znovu vloží skilly a důkazy (`ON DELETE CASCADE`),
4. přepíše ověření,
5. žádost → `approved`, zápis do `admin_audit_log`, notifikace `license_approved`.

Když cokoliv selže, nestane se nic, takže nevznikne „půlka licence“. Funkce je `SECURITY DEFINER`, ale `EXECUTE` má jen `service_role`. Běžný uživatel dostane `permission denied`.

## 5. Soubory ve Storage

| Bucket | Veřejný? | Co v něm je |
|---|---|---|
| `license-photos` | ano | fotka na kartě (vidí ji každý, kdo vidí licenci) |
| `license-files` | ne | důkazy a doklady k ověření, čte se přes **signed URL** (platí hodinu) |

Cesta je vždy `<user_id>/<náhodné-uuid>.<přípona>`. Politika na `storage.objects` povolí zápis jen do vlastní složky (`storage.foldername(name)[1] = auth.uid()`). Náhodné jméno znamená žádné kolize a žádné osobní údaje v URL.

Soubory se nahrávají až při **Save draft / Submit** (`toPayload` v `license-queries.ts`). Do té doby je v náhledu jen `blob:` URL (viz poznámka 15). Po uložení se načte verze ze serveru a všechny `blob:` URL se uvolní.

## 6. Žák ↔ učitel

```
teacher_students: teacher_id, student_id, skill_node_id, status, message
  pending ──Accept (učitel)──► active ──End──► ended
     │ └──Decline (učitel)──► declined
     └────Cancel (žák)──────► cancelled
```

- **Vložit** smí jen žák sám za sebe a jen pro skill, který má učitel na **schválené** licenci (podmínka `EXISTS` v RLS).
- **Přechody stavů** hlídá trigger `tg_teacher_students_guard`: učitel smí přijmout nebo odmítnout, žák smí jen zrušit. Ostatní sloupce jsou neměnné. RLS umí říct *kdo* smí řádek měnit, ale ne *z jakého stavu na jaký*, a na to je trigger.
- **Notifikace** posílá trigger `tg_teacher_students_notify` (nová žádost → učiteli, přijetí → žákovi). Je `SECURITY DEFINER`, protože uživatelé do `notifications` zapisovat nesmí. Triggerovou funkci nejde zavolat přes API.

## 7. Dashboard: odkud se berou data o žácích

Učitel přes RLS **nevidí** cizí progres ani aktivitu, a to je správně. Proto existuje funkce `teacher_students_overview()` (`SECURITY DEFINER`), která:

- vrací jen řádky, kde `teacher_id = auth.uid()`,
- progres počítá jen u přijatých (`active`) žáků, u žádostí ne,
- skládá data ze stávajících tabulek:

| Na dashboardu | Odkud |
|---|---|
| Level „Beginner (2/5)“ | `user_skill_level` + `skill_levels` |
| Progress 58 % | `user_progress_checks` / `skill_progress_items` daného skillu |
| 95 min this week | `user_skill_daily_time` za posledních 7 dní |
| Active now / 3 h ago | `max(user_daily_activity.updated_at)` |

**„Active now“** nepotřebuje žádný nový presence systém. Aplikace posílá heartbeat (`log_activity`) každých 30 s, dokud je otevřená. Kdo má `updated_at` mladší než 2 minuty, je online. Dashboard se obnovuje každou minutu.

**Chat** používá existující `startDirectChat(studentId)` → `get_or_create_direct_conversation`.

## 8. Jak jsem testoval databázi bez zanechání stop

Celý scénář (učitel odešle → zkusí se sám schválit → admin schválí → žák požádá o špatný skill → …) běží v jednom bloku, který na konci **schválně vyhodí výjimku**:

```sql
DO $test$
DECLARE r jsonb := '{}';
BEGIN
  -- přepnutí na roli konkrétního uživatele, aby platilo jeho RLS
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  …
  BEGIN
    UPDATE teacher_license_submissions SET status = 'approved' WHERE id = sub;
    r := r || '{"self_approve": "ALLOWED (BAD)"}';
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('self_approve', 'blocked: ' || SQLERRM);
  END;
  …
  RAISE EXCEPTION 'TEST_RESULT %', r;   -- výsledky ve zprávě, všechno se vrátí zpět
END $test$;
```

Výjimka vrátí celou transakci, takže v databázi nezůstane žádná licence, notifikace ani audit, a výsledky se přitom dají přečíst z chybové zprávy. Prošlo všech 11 kontrol (viz shrnutí v konverzaci).

## 9. Co je zatím mock / na později

- **Ověření e-mailem** je pořád mock: kód se neposílá a stav `verified` posílá klient. Admin ho vidí jako „e-mail verified“, ale skutečná kontrola má být v Edge Function (viz poznámka 16, kap. 8).
- **Materials** je jen připravená sekce s vypnutým tlačítkem.
- **Staré soubory** po úpravě licence zůstávají ve Storage, úklid zatím chybí.
- Žák zatím nemůže žádost zrušit ani ukončit spolupráci z UI. Databáze to umí (`cancelled` / `ended`), chybí jen tlačítka.

## 10. Bezpečnostní nález mimo tuhle práci

Supabase advisor při kontrole ukázal, že starší funkce `award_xp`, `award_skillcoins`, `approve_restructure_request` a další `SECURITY DEFINER` funkce může volat **kdokoliv, i nepřihlášený** (`anon`). Kdokoliv si tak může přes API připsat XP a coiny. Oprava: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` a `GRANT … TO service_role`, stejně jako u `approve_license_submission`.

## 11. Past: `sr-only` input a scroll pod stránkou

Skrytý `<input type="file" className="sr-only">` uvnitř `<label>` je běžný trik na hezké tlačítko pro výběr souboru. `sr-only` ale dělá z inputu `position: absolute`. Když žádný předek nemá `position: relative`, input se nepočítá do scrollujícího `<main>`, ale do celé stránky. Leží pak hluboko dole a `body` najednou jde scrollovat do prázdna pod aplikací. Při kliknutí ho prohlížeč ještě posune do zorného pole.

Oprava: obalovému `<label>` přidat `relative`. Ověřeno měřením: s opravou má stránka 900 px (= okno), bez ní 2714 px.

Stejně tak fotka licence: formulář má hlídat stejné typy souborů jako bucket (`license-photos`: JPG, PNG, WebP), a to hned při výběru, ne až při uložení.
