# Komponenty profilové stránky – design

Datum: 2026-11-26 · Stav: schváleno, implementováno

## 1. Záměr a proč

Profilová stránka (`/dashboard/profile-builder`, Notion-style editor z poznámky 19) má hlavičku (banner, avatar, jméno, bio) a pod ní tlačítko **+**, které zatím ukazuje jen „Coming soon“. Teď přidáváme **komponenty (bloky)**, ze kterých si uživatel stránku poskládá.

**Kdo profil otevírá:** hlavně **komunita**, která chce vidět, kdo jsi a na čem pracuješ, ale i **studenti**, kteří si vybírají učitele a potřebují mu věřit. Komunitě slouží osobní bloky a pokroky ve skillech. Studentům slouží **odznak učitele přímo u skillů**, nikoli samostatná komponenta.

## 2. Cíle, ne-cíle, anti-cíle

**Cíle**
- Pět typů bloků: **Text, Obrázek, Embed, Skill list, Skill spotlight**.
- Bloky jdou skládat **vedle sebe**. Vedle bloku je **+**, které přidá další blok do stejného řádku. Kombinované typy jako „text s obrázkem“ nejsou, stejný výsledek dají dva jednoduché bloky v jednom řádku.
- Skillové bloky ukazují **živá data** (aktuální level, progres, čas), ne snímek.
- U skillu, který člověk učí, je vidět **odznak učitele**.
- Veřejný profil (`/dashboard/profile/:id`) vypadá stejně jako editor, protože editor je přesný náhled.

**Ne-cíle (teď ne)**
- Statistiky (hodiny, XP, streak), sociální odkazy, CV upload jako nový blok.
- Vnořování řádků do bloků a libovolná mřížka.
- Vlastní pozadí nebo barvy bloků.

**Anti-cíle (selhání, i kdyby to technicky fungovalo)**
- Návštěvník uvidí skill, level nebo čas, který vlastník na profil **sám nedal**. Data z time trackeru a levelů jsou jinak soukromá (RLS „jen vlastní řádky“).
- Editor přestane působit jako Notion a změní se ve formulář nebo boční panel jako ve starém builderu.
- Řádek se 2–3 bloky se na mobilu rozbije nebo bude vodorovně scrollovat.

## 3. Omezení (zjištěno v kódu)

- Tabulka `profile_cards` (`id, user_id, position, type, data jsonb, created_at`) už existuje. Má RLS (číst může každý přihlášený, zapisovat jen vlastník), bucket `profile-media` (obrázky a PDF, 10 MB, složka `userId/`) a RPC `reorder_profile_cards`. Současné typy jsou `text, text_photo, photo, skills, cv`.
- `user_skill_level` a `user_skill_daily_time` mají RLS „jen vlastní řádky“, takže **živá data cizího skillu klient přímo nepřečte**. Totéž řeší `share_skill` (SECURITY DEFINER, [20261102001_chat_share_skill.sql](../../../supabase/migrations/20261102001_chat_share_skill.sql)). Jeho dotazy na level (`name, rank, total`), checklist (`done/total`) a atributy (`label, unit, value`) jdou převzít.
- Učitel: `teacher_licenses` (1 na uživatele, `verification_status` = `none|pending|verified`) a `license_skills` (`skill_node_id`, `level`, `status` = `approved|rejected`).
- Skill na profilu musí být v `user_skills` vlastníka a mít `skill_nodes.status = 'approved'` (stejně jako u `share_skill`).
- Nová migrace dostane číselný prefix `20261126001_…`. Pozor na kolize prefixů (viz poznámka 19).
- V repu je `@dnd-kit` (používá ho starý `SortableCardList`).

## 4. Zvažované přístupy

| | Přístup | Výhody | Nevýhody |
|---|---|---|---|
| **A** ✅ | **Řádky se sloupci**: `profile_cards` dostane `row` a `col`, stránka je seznam řádků po 1–3 blocích | Přesně odpovídá „vedle textu +“, tabulka zůstane plochá, RLS a bucket zůstanou, snadno se skládá na mobil | Do bloku nejde vnořit další řádek |
| B | Strom jako v Notionu (`columns` blok s dětmi přes `parent_id`) | Nejobecnější | Složité načítání, přeřazování i drag & drop. Vnořování nikdo nepotřebuje |
| C | Volná mřížka (`react-grid-layout`, x/y/w/h) | Efektní „bento“ | Nepůsobí jako Notion, špatně se skládá na mobilu, těžká knihovna |

**Zvoleno: A** (rozhodl uživatel).

## 5. Rozhodnuto s uživatelem

- Komunita i studenti, s důrazem na komunitu.
- První várka: Text, Obrázek, Embed, Skill list, Skill spotlight.
- Odznak učitele je **u skillů** (v listu i ve spotlightu), ne jako samostatná komponenta.
- **Čas z time trackeru** je vidět jen ve spotlightu. Spotlight má přepínač „Show time“ (výchozí: zapnuto). Skill list čas neukazuje.
- Žádný typ „text + obrázek“. Bloky se skládají vedle sebe přes **+ vedle bloku**.
- Rozložení podle přístupu A.

## 6. Návrh

### 6.1 Data

Migrace `20261126001_profile_components.sql` (idempotentní):

```sql
ALTER TABLE public.profile_cards
  ADD COLUMN row_index int NOT NULL DEFAULT 0,   -- "row" je v Postgresu rezervované slovo
  ADD COLUMN col_index int NOT NULL DEFAULT 0;
-- type CHECK → ('text','image','embed','skill_list','skill_spotlight')
-- index (user_id, row, col)
```

**Převod starých karet (jednorázově v migraci):**
- `text` zůstane `text`, nový řádek, `col 0`.
- `photo` se stane `image`.
- `text_photo` se rozdělí na **dva bloky v jednom řádku** (`text` col 0 a `image` col 1, nebo obráceně podle starého `data`).
- `skills` se stane `skill_list` (`skill_ids` se zachová).
- `cv`: *moje rozhodnutí:* převede se na `embed` typu „odkaz“ na PDF v `profile-media`, aby data nezmizela.
- `row` se vezme z původního `position`.

**Tvary `data` podle typu:**

| type | data |
|---|---|
| `text` | `{ heading?: string, body: string }`, plain text se zachovanými řádky (max ~2000 znaků) |
| `image` | `{ path: string, caption?: string }`, soubor v `profile-media/<userId>/…` |
| `embed` | `{ kind: 'youtube' \| 'link', url: string, title?, description?, image? }` |
| `skill_list` | `{ title?: string, skill_ids: uuid[] }` (pořadí = pořadí v poli) |
| `skill_spotlight` | `{ skill_id: uuid, show_time: boolean }` (`show_time` výchozí `true`) |

**Pravidla řádku (validuje klient, *moje rozhodnutí*):** max **3 bloky** v řádku. `skill_spotlight` smí být v řádku nejvýš s **jedním** dalším blokem. Šířky se dělí rovnoměrně.

**Přeřazení:** RPC `reorder_profile_cards` nahradí `save_profile_layout(p_layout jsonb)`, které atomicky nastaví `row/col` pro všechny bloky vlastníka (`[{id,row,col}]`, kontrola `auth.uid()`).

### 6.2 Živá data skillů: RPC

`get_profile_skills(p_user_id uuid) RETURNS jsonb` (SECURITY DEFINER, pro `authenticated`):
- vrací data **jen pro skilly, které jsou v blocích `skill_list` / `skill_spotlight` daného uživatele** a zároveň v jeho `user_skills` a jsou `approved`. Tím je splněný první anti-cíl,
- pro každý skill: `id, name, image_url, status` (z `user_skills`), `level {name, rank, total}`, `progress {done, total}`, `attributes [...]`, `time {total_seconds, last_30d_seconds}` (z `time_sessions`, tedy time trackeru; automatické měření na stránce Learn se nepočítá, aby se čas nezapočítal dvakrát). **Čas se vrací jen pro skill, který je v nějakém bloku `skill_spotlight` s `show_time = true`, jinak `null`.** Skill list čas nezobrazuje, takže pro skill jen v listu ho RPC vůbec nepošle (rozhodnutí uživatele: čas je soukromý, ve spotlightu je vidět, ale jde vypnout), `teaches {level, verified}`: objekt existuje, když má skill v licenci řádek `license_skills.status='approved'` (ten už schválil admin), jinak `null`. `verified` = `teacher_licenses.verification_status = 'verified'`. *Moje rozhodnutí:* „Teaches“ se zobrazí u každého schváleného skillu, „· verified“ jen u ověřené licence (odpovídá mockupům),
- dotazy na level, progres a atributy se převezmou ze `share_skill`.

Editor i veřejný profil volají stejné RPC. Editor ho po změně skillového bloku zavolá znovu.

### 6.3 Embed

- **YouTube:** z URL se vytáhne ID (`youtube.com/watch?v=`, `youtu.be/`, `shorts/`) a vykreslí se `<iframe src="https://www.youtube-nocookie.com/embed/ID">` (16:9).
- **Odkaz:** karta s titulkem, popisem a obrázkem. *Moje rozhodnutí:* náhled (OG tagy) se kvůli CORS v prohlížeči stáhnout nedá. V první verzi proto uživatel vyplní titulek sám (předvyplní se doména) a obrázek je volitelný. Automatický OG náhled přes edge funkci patří do „Co dál“.
- Jiné domény se nevkládají jako iframe, vždy jde o kartu s odkazem (bezpečnost).

### 6.4 Editor (ProfileBuilderPage)

```
┌─ řádek ──────────────────────────────────────────────┐
│ ⋮⋮ [ Text blok          ] [ Obrázek          ]  (+)  │  ← + vedle = blok do řádku (skryté, když je plno)
└──────────────────────────────────────────────────────┘
                         (+)                            ← + pod řádkem = nový řádek
```

- **+** otevře menu bloků (ikona, název, jeden řádek popisu) ve stylu současného popoveru.
- **Text:** inline, nadpis jako `input` a tělo jako `textarea` s `field-sizing-content`. Ukládá se na blur stejně jako jméno a bio v hlavičce.
- **Obrázek:** prázdný blok ukazuje „Upload image“ a po nahrání obrázek s popiskem pod ním (inline input). Při najetí myší se ukážou *Change / Remove* (stávající `HoverActions`). Obrázek se zmenší přes `resizeToBlob` (max 1600 px).
- **Embed:** prázdný blok je input „Paste a link…“ a po potvrzení se vykreslí. Najetí myší ukáže *Edit / Remove*.
- **Skill list / spotlight:** prázdný blok ukazuje „Choose skills“ / „Choose a skill“ a otevře popover s výběrem z **vlastních** `user_skills` (hledání, checkboxy u listu, jedna volba u spotlightu, pořadí v listu přes drag).
- **Menu bloku** (⋮⋮ při najetí myší): přetažení (dnd-kit, mezi řádky i v rámci řádku) a *Delete*. Spotlight má v menu navíc přepínač **Show time** a *Change skill*.
- Prázdný blok, který uživatel opustí bez obsahu, zůstane jako placeholder v editoru, ale **na veřejném profilu se nevykreslí**.

### 6.5 Vzhled skillových bloků

Spotlight:
```
┌──────────────────────────────────────────────┐
│  [ obrázek skillu ................ ACTIVE ]  │
│  Guitar                 ✓ Teaches · verified │
├──────────────────────────────────────────────┤
│  Intermediate        ● ● ● ○ ○   (level 3/5) │
│  Progress  ███████████░░░░░░░░   14/24       │
│  Time      42 h  · last 30 days 6 h          │
│  Style: Fingerstyle   Years: 3               │
│                                 [+ Add skill]│
└──────────────────────────────────────────────┘
```
Skill list:
```
Guitar        Intermediate ●●●○○   ✓ Teaches
Spanish       Beginner     ●○○○○
Climbing      Advanced     ●●●●○
```
- Vizuálně navazuje na `SkillShareCard` (gradient progres, tečky levelů, status pill). Společné kousky (`LevelDots`, `ProgressBar`, `formatValue`) se vytáhnou do sdíleného souboru, aby je chat i profil používaly stejně.
- Odznak: „✓ Teaches“, když existuje schválený `license_skills`, a k tomu „· verified“, když je licence `verified`. Klik vede na licenci nebo učitelský profil, pokud stránka existuje. Jinak je odznak bez odkazu.
- „+ Add skill“ se návštěvníkovi ukáže, když skill nemá. Když ho má, uvidí „In your skills“. Vlastník tlačítko nevidí. Logiku přidání převezmeme z chatu.
- Chybějící data (skill bez levelu, bez checklistu, bez času) se nevykreslují, řádek prostě není.
- Skill, který vlastník mezitím z profilu odebral nebo který byl smazán, se vynechá. Prázdný list nebo spotlight se na veřejném profilu nezobrazí.

### 6.6 Veřejný profil

- `PublicProfilePage` načte bloky seřazené podle `row, col`, zavolá `get_profile_skills` a vykreslí řádky stejnými komponentami jako editor (režim `readOnly`).
- Responzivita: řádek je `grid` s `grid-cols-1 md:grid-cols-N`. Na mobilu se bloky složí pod sebe v pořadí `col`.

### 6.7 Struktura kódu (návrh)

- `components/profile-blocks/`: `BlockRow`, `AddBlockMenu`, `blocks/TextBlock`, `ImageBlock`, `EmbedBlock`, `SkillListBlock`, `SkillSpotlightBlock`, `SkillPicker`, `types.ts`.
- `lib/profile-blocks-queries.ts`: CRUD bloků, `save_profile_layout`, `get_profile_skills`.
- Starý `components/profile-builder/` (`SortableCardList`, `CardEditorPanel`) se po převodu smaže.

## 7. Nechává se na staviteli

- Přesný vzhled menu bloků, ikony (lucide) a mezery.
- Debounce a ukládání (blur stačí, optimistic update jako v hlavičce).
- Jak přesně vypadá drag & drop mezi řádky (indikátor vložení).
- Limity délky textů a titulků (rozumné hodnoty, kontrola i v DB `CHECK` není nutná).
- Learning poznámka `docs/learning/20-*.md` (česky) na závěr.

## 8. Co dál (mimo tento design)

Statistiky, sociální odkazy, automatický OG náhled odkazů přes edge funkci, další embedy (Spotify, GitHub).

## 9. Odchylky při implementaci

- Sloupce se jmenují `row_index` a `col_index` (`row` je rezervované slovo). Převod starých karet běží jen jednou, hlídá ho existence sloupce.
- Čas se bere z `time_sessions` (time tracker), viz 6.2.
- Pořadí ve Skill listu = pořadí, v jakém skilly zaškrtneš v pickeru (čísla u checkboxů). Přetahování uvnitř listu není.
- Přepínač „Show time“ a „Change skill“ jsou v patičce spotlightu (jen v editoru), ne v menu ⋮⋮. Toolbar bloku má úchyt a koš.
- Skilly s `visibility` v `user_skills` se neřeší, protože UI ten sloupec nikde nepoužívá. Platí pravidlo jako u sdílení v chatu: skill musí být v profilu a `approved`.
