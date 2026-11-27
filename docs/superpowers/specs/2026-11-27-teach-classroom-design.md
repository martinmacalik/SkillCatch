# Teach jako „třída“: úkoly, odevzdání, knihovna materiálů

Stav: schváleno, fáze 1 implementována · 2026-11-27

## 1. Záměr a proč

Stránka Teach se má chovat jako Google Classroom s knihovnou materiálů. Učitel zadává úkoly,
žáci je odevzdávají a učitel je hodnotí. Učitel vidí žáky **seskupené podle skillu**. Žák žádnou
skupinu nevidí: pro něj je to osobní vztah s učitelem.

Dnes učitel na Teach vidí žádosti, žáky a jejich progres v checklistu. Sekce Materials je jen
placeholder „Coming soon“. Žák vidí učitele jen ve widgetu `TeachersWidget` na stránce Learn
(tlačítko „Learn with“, potom stav Requested nebo Chat).

## 2. Cíle, ne-cíle, anti-cíle

**Cíle**
- Učitel spravuje skupinu žáků pro každý skill, který učí. Zadává úkoly celé skupině nebo
  vybraným žákům, s termínem.
- Žák úkol odevzdá: text, soubory, odkazy. Učitel ho ohodnotí **Splněno** nebo **Vrátit k opravě**
  a přidá komentář. Vrácený úkol žák opraví a odevzdá znovu. Tenhle koloběh se opakuje, dokud
  úkol není splněný.
- Žák na stránce Learn daného skillu vidí místo seznamu učitelů **svého učitele** a widgety
  s úkoly, termíny a později i materiály.
- Učitel má knihovnu materiálů. Materiál vytvoří jednou a přiděluje ho opakovaně (fáze 2).

**Ne-cíle**
- Body ani známky. Hodnocení je pouze Splněno / Vrátit + komentář.
- Ruční zakládání skupin (třídy, kódy pozvánek). Skupina = aktivní žáci učitele v daném skillu.
- Rozvrh a kalendář hodin, videohovory.
- Viditelnost spolužáků. Žák nikdy nevidí ostatní žáky ani jejich odevzdání.

**Anti-cíle (selhání, i kdyby to technicky fungovalo)**
- Žák pozná, že je „jeden z osmi“, třeba z textu „8 students“, z cizích jmen nebo z hromadného
  komentáře.
- Učitel musí proklikávat žáky jednoho po druhém, aby zjistil, co má ke kontrole.
- Odevzdané soubory jsou dostupné komukoli jinému než žákovi a jeho učiteli.

## 3. Omezení

- Supabase s RLS. Zápisy, které mění stav, jdou přes SECURITY DEFINER RPC, stejně jako
  `teacher_students` a licence. Migrace jsou idempotentní.
- Vazba `teacher_students(teacher_id, student_id, skill_node_id, status)` už existuje a je unikátní
  pro otevřený pár učitel + žák + skill. Skupina z ní vznikne bez nové tabulky.
- Notifikace: tabulka `notifications` s CHECK na `type`. Zakládají je SECURITY DEFINER triggery
  nebo RPC, protože uživatel sám notifikaci vložit nemůže. Zobrazuje je `TopBar` přes
  `useNotifications`.
- Soukromé soubory: stejný vzor jako bucket `chat-media` (privátní bucket, cesta s ID, policies
  na `storage.objects`, signed URL).
- UI aplikace je anglicky, dokumentace česky.
- Necommitovat (uživatelská preference). Na konci každé fáze napsat českou learning poznámku.

## 4. Zvažované přístupy

| | Přístup | Výhody | Nevýhody |
|---|---|---|---|
| **A** ✅ | Vlastní tabulky pro úkoly, odevzdání a materiály | Přehled pro učitele, fronta ke kontrole, jasná práva, widget pro žáka čte z jednoho místa | Víc nových tabulek, RLS a UI |
| B | Úkoly jako karty v soukromém chatu učitel–žák | Rychlé: notifikace, média a realtime už fungují | Učitel s 8 žáky proklikává 8 chatů, úkoly zapadnou mezi zprávy, pro widget by se musely dolovat ze zpráv |
| C | Materiály jako `skill_learning_blocks` | Hotový editor | Ty bloky tvoří veřejnou Learn stránku skillu, kdežto materiál učitele je soukromý. Zamítnuto. |

Uživatel zvolil **A**, s pořadím fází 1 → 2 → 3.

## 5. Fáze 1: Úkoly a odevzdání (jádro)

### 5.1 Pojmy

- **Skupina** je dvojice (učitel, skill) a tvoří ji žáci s `teacher_students.status = 'active'`.
  V UI učitele se zobrazuje jako „Guitar · 8 students“. U žáka se nikde nezobrazuje.
- **Úkol** patří jednomu učiteli a jednomu skillu. Adresát je `group` (každý, kdo je ve skupině
  aktivní, včetně žáků, kteří přibudou později) nebo `students` (výběr ze skupiny).
- **Odevzdání** existuje jedno pro každou dvojici úkol + žák a má stav a vlákno záznamů.

### 5.2 Datový model (migrace `2026112700x_teach_assignments.sql`)

```
teach_assignments
  id uuid pk
  teacher_id uuid → profiles, skill_node_id uuid → skill_nodes
  title text (1–120), instructions text (≤ 5000, může být prázdné)
  due_at timestamptz null
  audience text check in ('group','students')
  attachments jsonb default '[]'   -- [{kind:'file',path,name,mime,size} | {kind:'link',url,title?}], max 10
  created_at, updated_at
  index (teacher_id, skill_node_id, created_at desc)

teach_assignment_students          -- jen pro audience = 'students'
  assignment_id → teach_assignments on delete cascade
  student_id → profiles
  pk (assignment_id, student_id)

teach_submissions
  id uuid pk
  assignment_id → teach_assignments on delete cascade
  student_id → profiles
  status text check in ('submitted','returned','done')
  first_submitted_at timestamptz   -- první odevzdání (podle něj se počítá „po termínu“)
  submitted_at timestamptz         -- poslední odevzdání
  reviewed_at timestamptz null
  unique (assignment_id, student_id)
  index (assignment_id, status)

teach_submission_entries           -- vlákno, jen přidávat, nikdy neupravovat
  id uuid pk
  submission_id → teach_submissions on delete cascade
  author_id → profiles
  kind text check in ('submission','review','comment')
  decision text null check in ('done','returned')   -- jen u kind = 'review'
  body text (≤ 5000)
  attachments jsonb default '[]'  -- stejný tvar jako u úkolu, max 10
  created_at
  index (submission_id, created_at)
```

„Nezačato“ znamená, že řádek v `teach_submissions` neexistuje. Stav nezačato / odevzdáno /
vráceno / splněno se odvozuje takhle: bez řádku → nezačato, jinak podle `status`.
„Po termínu“ se počítá, neukládá se: `due_at < coalesce(first_submitted_at, now())`. Rozhoduje
**první** odevzdání. Když žák odevzdal včas a opravu pošle po termínu, „po termínu“ to není.
Výjimka pro nováčky: pokud termín uplynul dřív, než žák do skupiny přibyl (`teacher_students.responded_at`
aktivní vazby), úkol se mu jako po termínu neoznačuje a termín se mu nezobrazuje červeně.
*(Rozhodnutí návrhu.)*

**Kdo má k úkolu přístup (`can_see_assignment(a, uid)`, helper SECURITY DEFINER STABLE):**
- učitel úkolu, nebo
- žák s aktivní vazbou `teacher_students` (teacher_id, uid, skill_node_id), a zároveň buď
  `audience = 'group'`, nebo existuje řádek v `teach_assignment_students` pro tohoto žáka.

Když vazba skončí (`ended`), žák přestane úkoly vidět. Data zůstanou a znovu se ukážou, pokud se
k učiteli vrátí. *(Rozhodnutí návrhu.)*

**Okrajové stavy** *(všechno jsou rozhodnutí návrhu)*:
- **Žák odešel (vazba `ended`):** u učitele zůstane v detailu úkolu jako šedý řádek „Left“.
  Vlákno jde otevřít jen ke čtení: nejde ohodnotit ani komentovat, takže odejitý žák nedostává
  notifikace. Nepočítá se do „3/8 submitted“, do „N to review“ ani do fronty ke kontrole.
  Všechny počty a fronta proto berou jen žáky s aktivní vazbou.
- **Žák odebraný z úkolu úpravou** (změna `group` → `students` nebo odškrtnutí): už odevzdanou
  práci nemaže. Stejně jako u odejitého žáka ji jen schová. Žák úkol přestane vidět, učitel ho
  vidí šedě jako „Removed“, jen ke čtení.
- **Učitel přijde o skill z licence** (například při novém podání licence je skill zamítnut
  nebo odebrán, ale vazby `teacher_students` zůstanou): skupina dál existuje, dokud má aktivní
  žáky. Učitel může prohlížet, hodnotit a komentovat existující úkoly a žáci můžou odevzdávat.
  **Nový úkol** ale vytvořit ani existující upravit nejde. Na kartě skupiny se zobrazí štítek
  „Not on your license“. Platí tedy: přístup a hodnocení se řídí aktivní vazbou, tvorba
  a úprava úkolu se řídí schváleným `license_skills`.

### 5.3 RLS a RPC

- `teach_assignments`: SELECT podle `can_see_assignment`. INSERT/UPDATE smí jen učitel
  s `teacher_id = auth.uid()`, který má schválený `license_skills` pro daný skill. DELETE smí
  učitel úkolu vždy.
- `attachments` jsonb nechat otevřené pro budoucí `{kind:'material', material_id}` (fáze 2).
  Validace v RPC má známé typy whitelistovat, ne natvrdo zakázat všechno ostatní kromě file a link.
- `teach_assignment_students`: SELECT pro učitele úkolu a pro žáka na řádku. Zápis jen přes RPC.
- `teach_submissions` a `teach_submission_entries`: SELECT pro žáka odevzdání a pro učitele úkolu.
  **Žádný přímý zápis**, všechno jde přes RPC:
  - `create_assignment(p_skill_node_id, p_title, p_instructions, p_due_at, p_audience, p_student_ids uuid[], p_attachments)`
    a `update_assignment(p_id, …)`. Ověří licenci a že `p_student_ids` jsou aktivní žáci skupiny.
    Notifikace `assignment_new` dostanou adresáti: při vytvoření všichni, při úpravě jen nově
    přidaní.
  - `submit_assignment(p_assignment_id, p_body, p_attachments)`. Ověří přístup, odmítne prázdné
    odevzdání (bez textu i příloh) a odmítne, pokud je stav `done`. Vytvoří nebo aktualizuje
    submission na `submitted`, přidá záznam `submission` a notifikaci `assignment_submitted`
    učiteli.
  - `review_submission(p_submission_id, p_decision, p_comment)`. Jen učitel úkolu a jen ve stavu
    `submitted`. Nastaví `done` nebo `returned`, přidá záznam `review` a notifikaci
    `assignment_reviewed` žákovi. U `returned` je komentář povinný.
  - `comment_submission(p_submission_id, p_body)`. Žák nebo učitel, kdykoli. Přidá záznam
    `comment` a pošle notifikaci druhé straně (`assignment_comment`).
  - `teacher_groups_overview()` vrátí pro každý skill učitele: název, počet aktivních žáků, počet
    úkolů, počet čekajících na kontrolu (`submitted`) a nejbližší termín.
  - `assignment_progress(p_assignment_id)` vrátí adresáty úkolu se stavem, `submitted_at`
    a příznakem po termínu (pro přehled učitele).
- Smazání úkolu (učitel, s potvrzením) smaže kaskádou odevzdání. Soubory v bucketu smaže klient
  podle seznamu cest, který RPC `delete_assignment` vrátí. Stejný vzor jako `deleteBlock`.
- Notifikace: CHECK rozšířit o `assignment_new`, `assignment_submitted`, `assignment_reviewed`,
  `assignment_comment`. Data notifikace: `assignment_id`, `title`, `skill_name`, `skill_node_id`,
  jméno druhé strany. **Text notifikace pro žáka nikdy nezmiňuje skupinu.**

### 5.4 Soubory

- Nový privátní bucket `teach-files`, limit 15 MB na soubor. MIME: obrázky, PDF, audio
  (mp3/m4a/wav/ogg). Video se přikládá jako odkaz (YouTube apod.), kvůli velikosti.
- Cesty:
  - příloha úkolu: `{assignment_id}/teacher/{uuid}.{ext}`
  - odevzdání: `{assignment_id}/{student_id}/{uuid}.{ext}`
- Policies na `storage.objects`:
  - čtení: učitel úkolu všechno ve složce `{assignment_id}/`; žák složku `teacher/` (pokud vidí
    úkol) a vlastní složku `{student_id}/`
  - zápis: učitel do `teacher/`; žák do své složky (pokud vidí úkol)
  - mazání: **jen učitel úkolu, celá složka `{assignment_id}/`** (úklid po smazání úkolu
    a odebrání vlastní přílohy úkolu). Žák soubory mazat nemůže, protože vlákno je jen pro
    přidávání a odkaz na soubor v něm nesmí zůstat rozbitý. Soubory nahrané do formuláře, který
    žák nakonec neodeslal, zůstanou v bucketu. Ve v1 je to přijatelné, úklid osiřelých souborů
    je mimo rozsah. *(Rozhodnutí návrhu.)*
- Zobrazení přes signed URL (jako chat-media). Obrázky se před nahráním zmenší přes
  `resizeToBlob`.
- Odkazy kontroluje `normalizeUrl` při renderu (jen http/https), YouTube jako náhled
  `youtube-nocookie`. Obojí už existuje v `lib/profile-blocks.ts`. Přesunout do sdíleného
  `lib/links.ts`.

### 5.5 UI učitele (Teach)

Pravý sloupec `TeacherDashboard` se mění takto:
- `StudentsSection` zůstává pro **žádosti** (přijmout / odmítnout). Seznam žáků se nahradí
  sekcí **Classes**: jedna karta na skill.

```
┌ Guitar ───────────────────────────────┐
│ 8 students · 5 assignments            │
│ ● 3 to review     next due Fri 29 Nov │
└───────────────────────────────────────┘
```

- Klik na kartu otevře **stránku skupiny** `/dashboard/teach/class/:skillId`. Má záhlaví
  (skill, počet žáků, „+ New assignment“) a dvě záložky:
  - **Assignments**: seznam úkolů (název, termín, „3/8 submitted · 2 to review“). Nahoře filtr
    „To review“, který slouží jako fronta ke kontrole přes všechny úkoly skupiny.
  - **Students**: dnešní řádky žáků (online stav, checklist progres, Chat). Navíc u každého žáka
    počet otevřených a vrácených úkolů. Klik vyfiltruje Assignments na tohoto žáka.
- **Nový úkol / úprava** (modal):
  - název, zadání (textarea), termín (datum + čas, volitelné)
  - adresáti: „Whole class“ nebo výběr žáků (checkboxy)
  - přílohy: soubor nebo odkaz
- **Detail úkolu**: zadání nahoře, pod ním tabulka adresátů se stavem (Not started / Submitted /
  Returned / Done / late). Klik na žáka otevře **vlákno odevzdání**: záznamy v čase, přílohy,
  u stavu `submitted` dole tlačítka **Mark done** a **Return** (Return vyžaduje komentář) a pole
  pro komentář. Šipky další/předchozí odevzdání ke kontrole, aby učitel prošel frontu bez
  vracení do seznamu.

### 5.6 UI žáka (Learn)

`TeachersWidget(skillNodeId)`:
- Bez aktivní vazby zůstává jako dnes (seznam učitelů, Learn with, Requested).
- S aktivní vazbou (může jich být víc, u každého učitele jedna) se pro každého učitele zobrazí
  karta **Your teacher**:

```
┌ Your teacher ────────────────────────────┐
│ (foto) Jan Novák · Guitar       [Chat]   │
├──────────────────────────────────────────┤
│ Assignments                              │
│  ● Chords G–C–D       due Fri 29 Nov →   │
│  ↺ Rhythm 4/4         returned · fix it  │
│  ○ Tuning             submitted          │
│  Show done (4)                           │
└──────────────────────────────────────────┘
          Other teachers for this skill →
```

  - Řazení: vrácené → nezačaté podle termínu → odevzdané. Splněné jsou schované pod
    „Show done“. Po termínu je termín zobrazený červeně.
  - Seznam ostatních učitelů je sbalený pod odkazem „Other teachers for this skill“.
- Klik na úkol otevře **detail úkolu** jako modal nad Learn (`?assignment=<id>` v URL, aby šel
  odkaz z notifikace otevřít přímo). Obsahuje zadání, přílohy učitele, termín a vlákno.
  Formulář odevzdání (text, soubory, odkazy) je vidět ve stavu nezačato a vráceno. Ve stavu
  odevzdáno je vidět jen „Waiting for review“ a pole na komentář. Ve stavu splněno se zobrazí
  zelené potvrzení.
- Text vždy v jednotném čísle („your teacher assigned you…“). Nikde se neobjeví počet žáků.

### 5.7 Notifikace v UI

`TopBar` / `useNotifications` dostane nové typy:
- `assignment_new` → odkaz na `/dashboard/learn/:skillId?assignment=:id`
- `assignment_reviewed`, `assignment_comment` (pro žáka) → stejný odkaz
- `assignment_submitted`, `assignment_comment` (pro učitele) → stránka skupiny, detail úkolu,
  otevřené vlákno žáka

## 6. Fáze 2: Knihovna materiálů (obrys)

- `teach_materials(id, teacher_id, title, kind 'lesson'|'video'|'exercise'|'file', blocks jsonb,
  skill_node_id null, created_at, updated_at)`. Bloky mají stejné tvary jako Learn bloky
  (text, callout, resource_list, flashcards, checklist). Editor se převezme z Learn editoru
  a renderery z Learn.
- Sekce `MaterialsSection` na Teach se stane knihovnou: seznam, filtr podle skillu, editor.
- Přidělení: `teach_material_shares(material_id, skill_node_id, student_id null)`. Prázdný
  `student_id` znamená celou skupinu. Přístup se počítá stejně jako u úkolů.
- Úkol může mít v `attachments` položku `{kind:'material', material_id}`.
- Žák: ve widgetu přibude sekce **Materials** se seznamem materiálů přidělených jemu nebo jeho
  skupině. Klik otevře čtečku v modalu.

## 7. Fáze 3: Doplňky (obrys)

- **XP** za splněný úkol přes `award_xp(student, N, 'assignment_done', submission_id)`,
  jednou za odevzdání (už existuje vzor „once per reference“).
- **Připomínka termínu**: pg_cron každou hodinu pošle notifikaci `assignment_due_soon`
  24 h před termínem, pokud úkol ještě není odevzdaný. Každému žákovi jen jednou za úkol.
- **Přehledová tabulka** na stránce skupiny: žáci × úkoly, v buňkách barevné stavy, klik otevře
  vlákno.

## 8. Ponecháno na implementaci

- Přesné názvy komponent a rozdělení souborů (vzor: `components/teach/class/…`,
  `lib/teach-assignments-queries.ts`).
- Vzhled modalů a karet v rámci stávajícího stylu Teach (fialové akcenty, `rounded-2xl`).
- Jestli detail úkolu u učitele bude modal, nebo podstránka.
- Realtime: v1 stačí načíst znovu po akci a po otevření notifikace.

## 9. Odchylky při implementaci (fáze 1)

- **Mazání úkolu ve dvou krocích:** `assignment_file_paths` → klient smaže soubory → `delete_assignment`. Delete policy ve storage potřebuje, aby úkol ještě existoval, a SQL samo objekty ze storage smazat neumí.
- **`create_assignment` má volitelné `p_id`:** id generuje klient, aby přílohy učitele šly nahrát do `{id}/teacher/` ještě před vytvořením úkolu. Storage policy proto pro složku `teacher/` povolí i id úkolu, který zatím neexistuje (nahrávající musí mít schválenou licenci, číst smí jen vlastník souboru).
- **Přibylo RPC `class_students_summary`** pro záložku Students (počty otevřených, vrácených a čekajících na kontrolu).
- **`teacher_classes_overview`** ukazuje i skilly, ve kterých má učitel úkoly, i když v nich nemá licenci ani aktivní žáky. Starší práce tak zůstane dostupná z notifikací.
- **`MaterialsSection`** se do fáze 2 na Teach nezobrazuje (soubor zůstal). Seznam žáků se přesunul na stránku třídy a `StudentsSection` ukazuje jen žádosti.
- **Editace úkolu** předvybere jen aktivní žáky. Žák, který mezitím odešel, by ve formuláři nešel odškrtnout a RPC by uložení odmítlo.
