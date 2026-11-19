# 16 – Teach: instituce, tituly a ověření učitele

Navazuje na [15-teach-ucitelska-licence.md](15-teach-ucitelska-licence.md) (první verze stránky Teach). Pořád jen frontend a statická data, žádné volání Supabase.

## 1. Co bylo uděláno

Formulář licence má teď pět sekcí:

```
1 About you             fotka · titul před · titul za · role · bio
2 School or organization  země (combobox) · typ instituce · instituce (combobox / volný text)
3 Skills you teach      beze změny (skilly + důkazy)
4 Educator verification školní e-mail + kód  NEBO  nahraný doklad   → none / pending / verified
5 Card theme            beze změny
```

A karta:

```
┌──────────────────────────────────────────────────────┐
│ SkillCatch                          TEACHING LICENSE │
│ Mgr. Jana Nováková, Ph.D.           ┌──────┐┌──────┐ │
│ TEACHER                             │  ✓   ││ foto │ │  ← razítko „Verified educator“
│ 🇨🇿 Gymnázium Jana Nerudy, škola     │VERIF.││      │ │     (šedé „Pending“ při čekání)
│    hlavního města Prahy…            └──────┘└──(◎)─┘ │  ← max. 2 řádky, vlajka země
│ I help beginners find flow…                          │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ [BOULDERING · EXPERT · DRAFT] [BAKING · …]           │
└──────────────────────────────────────────────────────┘
                 pevný poměr 1,6 : 1, max. 640 px
```

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `apps/web/src/components/teach/CountryCombobox.tsx` | výběr země (všech 249, vlajka, hledání) |
| `apps/web/src/components/teach/InstitutionCombobox.tsx` | hledání školy / univerzity, nebo volný text |
| `apps/web/src/components/teach/TitleInput.tsx` | titul před / za jménem s nabídkou častých titulů |
| `apps/web/src/components/teach/EducatorVerification.tsx` | ověření učitele (e-mail s kódem / doklad), zatím mock |
| `apps/web/src/components/teach/ComboboxList.tsx` | společný rozbalovací seznam všech comboboxů |
| `apps/web/src/components/teach/SelectMenu.tsx` | náš stylovaný „select“ (Role, Institution type) místo nativního `<select>` |
| `apps/web/src/hooks/useCombobox.ts`, `useDebouncedValue.ts` | klávesnice + ARIA, debounce |
| `apps/web/src/lib/institution-data.ts`, `searchKey.ts` | lazy načítání seznamů, vyhledávání bez diakritiky |
| `apps/web/src/data/countries.ts` | statický seznam ISO 3166 + vlajka + výchozí země |
| `apps/web/src/data/schools/cz.json`, `universities.json` | vygenerovaná data (patří do repozitáře) |
| `apps/web/scripts/schools/*.ts` | skripty, které ta data stahují a zmenšují |
| `apps/web/src/types/institutions.ts` | tvar řádků v JSON datech |

| `apps/web/src/types/teaching.ts` | změněno: `titleBefore/After`, `role`, `institution*`, `verification` místo `title` a `organization` |
| `apps/web/src/components/teach/LicenseCard.tsx` | přepsáno: pevný poměr, jméno s tituly, razítko ověření |
| `apps/web/src/components/teach/LicenseForm.tsx` | přepsáno: nové sekce 2 a 4, pole přes `<label htmlFor>` |
| `apps/web/package.json`, `tsconfig.node.json` | npm skripty `build:schools:cz`, `build:universities`; typová kontrola složky `scripts` |

## 3. Kde jsem se odchýlil od zadání nebo udělal něco navíc

Je toho víc, než zadání přímo říkalo. Tady je proč, ať se dá každá věc snadno vrátit.

**Odchylky (zadání nešlo splnit doslova):**

| Zadání | Skutečnost | Proč |
|---|---|---|
| XML z `rejstriky.msmt.cz/opendata/` | JSON-LD z `lkod-ftp.msmt.gov.cz` | původní XML vrací 404, MŠMT data přesunulo (viz kap. 4) |
| typ školy ZŠ/SŠ/VOŠ… | víc typů v jednom řetězci, např. `"ZŠ, MŠ"` | jeden záznam (ředitelství) často provozuje víc škol |
| route `/teach` | `/dashboard/teach` | všechny stránky se sidebarem jsou pod `/dashboard` (už z první verze) |

**Věci navíc (rozhodnutí, která můžeš vrátit):**

- **Výběr škol:** skript vynechává subjekty, které provozují jen jídelnu, internát, poradnu apod. Ze ~10 000 jich tak zbylo 9 540. Seznam kódů je jedna konstanta `SCHOOL_TYPES` v `build-cz.ts`.
- **Úprava dat:** u Prahy se místo „Praha“ ukládá obvod („Praha 1“) a z názvu se ořízne „, příspěvková organizace“.
- **Aliasy zemí:** „cesko“, „uk“, „usa“, „deutschland“… najdou správnou zemi (anglický název je „Czechia“, takže „cesk“ by jinak nic nenašlo).
- **Reset ověření:** když se změní instituce, e-mailové ověření se zruší, protože kontrola domény platila pro tu předchozí. Totéž při přepnutí role mezi Student a ostatními (kap. 7).
- **Výsledek ověření:** e-mail bez známé domény (ručně zadaná instituce nebo nesouhlasná doména) skončí po kódu jako **Pending**, ne Verified. Musí ho schválit admin.
- **Mobil:** pevný poměr karty platí až od šířky karty 448 px. Na telefonu byla karta tak nízká, že by se instituce i bio ořízly.
- **Hustý režim karty:** při více než 4 skillech mají razítka jeden řádek a bio max. 2 řádky, aby se 8 skillů vešlo do pevného poměru.
- **Sdílený základ comboboxů:** `useCombobox` + `ComboboxList` (místo tří kopií stejné logiky klávesnice).
- **`searchKey` přesunuto do `src/lib`:** používá ho jak UI, tak načítání dat.

**Známé omezení:** Windows nemá emoji vlajek, takže Chrome místo 🇨🇿 ukáže písmena „CZ“. Na Macu, Androidu a iOS je vlajka normálně. Šlo by to spravit polyfill fontem (`country-flag-emoji-polyfill`), ale to je nová závislost, takže jsem ji nepřidal.

**Drobnost z vývoje:** nástroj, kterým píšu soubory, převedl v regexech `\uFEFF` a `\u0300-\u036f` na skutečné neviditelné znaky. ESLint to u BOM chytil (`no-irregular-whitespace`), u diakritiky ne. Opraveno na čitelné escape sekvence. Kdyby regex s Unicode někdy „divně nefungoval“, stojí za to se podívat na bajty (`od -c`).

## 4. Instituce: build skripty a statická data

### Proč statická data a ne API

Seznam škol se mění pomalu (pár změn týdně), ale hledá se v něm při každém psaní. Kdyby se každý stisk klávesy ptal serveru, bylo by to pomalé a závislé na cizí službě. Proto data jednou **předpřipravíme skriptem**, uložíme jako JSON do repozitáře (patří do repozitáře, aplikace pak funguje i bez spuštění skriptů) a prohlížeč v nich hledá sám.

```
 zdroj (otevřená data)          skript (Node)                    repozitář              prohlížeč
┌─────────────────────┐   ┌──────────────────────────┐   ┌───────────────────┐   ┌────────────────┐
│ MŠMT: 31 MB JSON-LD │──►│ build-cz.ts              │──►│ schools/cz.json   │──►│ lazy chunk     │
│ (adresy, ředitelé,  │   │ vybere id, název, obec,  │   │ 9 540 škol, 1,2 MB│   │ ~200 kB gzip,  │
│ kapacity, obory…)   │   │ typ; deduplikuje, seřadí │   │                   │   │ až při focusu  │
└─────────────────────┘   └──────────────────────────┘   └───────────────────┘   └────────────────┘
```

Spuštění (z `apps/web`):

```bash
pnpm run build:schools:cz      # → src/data/schools/cz.json
pnpm run build:universities    # → src/data/universities.json
```

Skripty jsou v TypeScriptu a spouští je přímo `node` (od Node 22.18 umí „type stripping“, tedy prostě zahodí typy). Proto nepotřebujeme `tsx` ani jiný nástroj navíc.

### Zdroj: rejstřík škol MŠMT (ověřeno 19. 11. 2026)

- Původní `https://rejstriky.msmt.cz/opendata/vrejcelk.xml` **už neexistuje** (404). Výpis adresáře je zakázaný (403) a katalog MŠMT na GitHubu na ten soubor pořád odkazuje, takže je zastaralý.
- Aktuální odkaz jsem našel přes **Národní katalog otevřených dat** (data.gov.cz → „Rejstřík škol a školských zařízení – celá ČR“): `https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-…/RSSZ-cela-CR.jsonld`. Formát je **JSON-LD** (ne XML), aktualizuje se denně.
- Jeden záznam = **právnická osoba** (ředitelství) s `redIzo` (= RED_IZO), `uplnyNazev`, `adresa.obec` a polem `skolyAZarizeni`. To jsou jednotlivé školy a zařízení s kódem `druh` (A00 MŠ, B00 ZŠ, C00 SŠ, E00 VOŠ, F10 ZUŠ…).
- Skript bere jen subjekty, které provozují školu nebo zájmové vzdělávání (MŠ, ZŠ, SŠ, konzervatoř, VOŠ, ZUŠ, jazyková škola, DDM/SVČ). Samotné jídelny, internáty a poradny vynechá. Typ složí z kódů, např. `"ZŠ, MŠ"`. U Prahy bere místo „Praha“ obvod („Praha 4“) a z názvu ořízne „, příspěvková organizace“.

### Zdroj: univerzity (Hipo/university-domains-list)

`https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json` je pole objektů `{ name, alpha_two_code, country, domains, web_pages, "state-province" }`. Zdroj **nemá id**, proto skript vyrábí stabilní slug `cz-charles-university-prague`. Duplicity (stejná země + název) sloučí a spojí jejich domény. Domény se později hodí na kontrolu školního e-mailu.

### Proč rozdělené podle zemí

`src/data/schools/cz.json`, později `sk.json`, `pl.json`… Uživatel z Česka nikdy nestáhne polské školy. Přidat zemi znamená napsat skript `build-sk.ts`, který vyrobí `sk.json` se stejným tvarem (`SchoolRecord`). Aplikace soubor najde sama (viz `import.meta.glob` níže), v komponentách se nic nemění.

## 5. Jak funguje combobox

Všechny tři comboboxy (země, instituce, tituly) sdílejí hook `useCombobox` (klávesnice + ARIA) a komponentu `ComboboxList` (vzhled). Liší se jen tím, odkud berou položky.

### Klávesnice a ARIA

| Klávesa | Co udělá |
|---|---|
| ↓ / ↑ | otevře seznam / posune zvýraznění (dokola) |
| Enter | vybere zvýrazněnou položku |
| Escape | zavře seznam |
| Tab | zavře seznam a jde dál |

Focus zůstává **pořád v inputu**. Zvýrazněná položka se čtečce obrazovky ohlásí přes `aria-activedescendant`, takže uživatel slyší, na čem je, i když kurzor nikam neskáče.

Past: kliknutí myší na položku by nejdřív vzalo inputu focus → `onBlur` → seznam zmizí → `onClick` se nestihne. Proto má položka `onMouseDown={e => e.preventDefault()}`.

### Select bez psaní (`SelectMenu`)

Role a typ instituce byly původně nativní `<select>`. Jeho rozbalený seznam kreslí prohlížeč nebo systém a skoro nejde stylovat, proto vypadal jinak než naše comboboxy. `SelectMenu` je tlačítko + stejný `ComboboxList` + stejný hook `useCombobox` (proto hook bere `KeyboardEvent<HTMLElement>`, ne jen input). Navíc:

- seznam se otevře **na vybrané položce** (u země totéž),
- **mezerník** na zavřeném tlačítku seznam otevře (nativní „klik“), na otevřeném vybere,
- vybraná položka má ✓.

### Dvě opravené drobnosti

**Šedý scrollbar v dropdownu.** `index.css` dává na `<html>` tmavé `scrollbar-color`. Tahle vlastnost se **dědí** na všechny prvky a v Chrome má přednost před `::-webkit-scrollbar` pravidly, takže světlé styly z `.dashboard-main` se na seznam nedostaly. `ComboboxList` si proto nastavuje vlastní `scrollbarColor` přímo ve `style`.

**Zvýraznění skákalo na jinou položku.** Seznam se otevře na vybrané zemi a `scrollIntoView` kvůli tomu posune i stránku. Seznam tak „podjede“ pod stojící kurzor a prohlížeč to hlásí jako najetí myší (`mouseenter`). Zvýraznění pak přeskočilo z United States na Ugandu. Položky proto reagují na `mousemove` a jen tehdy, když se souřadnice kurzoru **opravdu změnily**.

### Normalizace diakritiky (NFD)

```ts
'Škola Žďár'.normalize('NFD')          // "S" + "ˇ" + "kola Z" + "ˇ" + "d" + "ˇ" + "a" + "ˊ" + "r"
  .replace(/[\u0300-\u036f]/g, '')     // smaže kombinující znaménka → "Skola Zdar"
  .toLowerCase()                       // → "skola zdar"
```

NFD rozloží znak s diakritikou na **základní písmeno + samostatné znaménko**. Znaménka leží v Unicode rozsahu U+0300–U+036F a regex je smaže. Stejnou funkci (`searchKey`) prohneme přes dotaz i přes data, takže „gymnazium“ najde „Gymnázium“.

Pro rychlost se klíč dat počítá **jednou při načtení** (`key` u každé položky), ne při každém hledání. Hledá se tak, že **každé slovo** dotazu musí být v klíči („zs brno“ najde „Základní škola … Brno“). Položky, které dotazem začínají, jdou nahoru, a výsledků je max. 20.

### Debounce

```
píšu:      g   y   m   n   a   z         (pauza 200 ms)
hledání:                          ▲  jen jednou, s „gymnaz“
```

`useDebouncedValue(value, 200)` vrátí novou hodnotu až po 200 ms klidu. Každý další stisk zruší předchozí časovač (`clearTimeout` v úklidové funkci efektu). Prohledání 9 500 škol při každém stisku by bylo zbytečné. Input se přitom aktualizuje okamžitě, zpožďuje se jen hledání.

### Lazy load přes dynamic import

```ts
const schoolLoaders = import.meta.glob<SchoolRecord[]>('../data/schools/*.json', { import: 'default' })
// → { '../data/schools/cz.json': () => import('../data/schools/cz.json') }
```

- `import.meta.glob` je funkce Vite. Při buildu najde všechny soubory podle vzoru a pro každý vytvoří funkci s **dynamic importem** `import(…)`.
- Každý JSON se tak stane **samostatným chunkem** (`cz-….js`, `universities-….js`). V hlavním bundlu není a stáhne se, až se loader zavolá.
- Volá se v `onFocus` pole instituce. Uživatel, který licenci nikdy nevyplní, data nestáhne.
- Obyčejný `import()` se jménem souboru poskládaným z proměnné by Vite neumělo spolehlivě rozdělit. Glob mu dopředu řekne, jaké soubory existují, a zároveň odpoví na „má tahle země seznam škol?“ (`hasSchoolList`).
- Výsledek se drží v `Map` cache jako **Promise**. Druhé focusnutí ani přepnutí typu tam a zpět nic znovu nestahuje.

Pole se po změně země nebo typu instituce „resetuje“ přes `key`, který obsahuje typ i zemi. Změněný `key` řekne Reactu, ať komponentu zahodí a vytvoří novou, takže se vynuluje i její interní stav (režim „není v seznamu“, načtená data).

## 6. Jméno s tituly na kartě

```ts
formatNameWithTitles('Jana Nováková', 'Mgr.', 'Ph.D.')  // "Mgr. Jana Nováková, Ph.D."
formatNameWithTitles('Jana Nováková', 'Mgr.', '')       // "Mgr. Jana Nováková"
formatNameWithTitles('Jana Nováková', '', 'Ph.D.')      // "Jana Nováková, Ph.D."
```

1. Titul před a jméno se spojí mezerou: `[before, name].filter(Boolean).join(' ')`. `filter(Boolean)` vyhodí prázdné řetězce, takže nevznikne dvojitá mezera.
2. Čárka + titul za se přidá, **jen když je titul za vyplněný** (česká typografie: „Jana Nováková, Ph.D.“).
3. Pod jménem je role (Teacher, Coach…). Pod ní instituce s vlajkou země, max. 2 řádky (`line-clamp-2`). Zalamuje se po slovech, slovo se nikdy neláme uprostřed.

Tituly se nevalidují. Nabídka (Bc., Mgr., Ph.D.…) je jen pohodlí a uživatel může napsat cokoliv (max. 30 znaků).

**Pevný poměr karty.** Od šířky 448 px má karta poměr 1,6 : 1 (`@md:aspect-[1.6]`, max. 640 px). Velikosti písma rostou s šířkou karty (`clamp(min, X cqw, max)`, kde `cqw` = 1 % šířky containeru). Při více než 4 skillech se karta „zahustí“: razítka mají jeden řádek a bio max. 2 řádky. Co se přesto nevejde, ořízne textový sloupec (`overflow-hidden`), takže text nikdy nepřekryje razítka. Na telefonu má karta přirozenou výšku, aby se nic neořezávalo.

## 7. Verified educator / Verified student

### Proč dva druhy ověření

Školní e-mail (nebo doklad) dokazuje jen **příslušnost ke škole**, ne že tam člověk učí. Student vysoké nebo střední školy, který něco dobře umí, má školní e-mail taky. Proto:

| Role | Co se ověřuje | Razítko na kartě |
|---|---|---|
| Student | že tam studuje (ISIC, potvrzení o studiu) | **Verified student** (ikona čepice) |
| všechny ostatní | že tam učí / pracuje (zaměstnanecká karta, smlouva) | **Verified educator** (ikona štítu) |

Druh se ukládá **v okamžiku odeslání** do `verification.kind` (`educator` / `student`). Karta se řídí tímhle polem, ne aktuální rolí. Když uživatel po ověření přepne roli na druhý druh (ověřený Student → Teacher), ověření se zruší, jinak by karta tvrdila něco, co nikdo neověřil. Přepnutí v rámci stejného druhu (Teacher → Coach) ověření nechá.

```ts
verificationKindForRole('student')  // 'student'
verificationKindForRole('coach')    // 'educator'
verificationKindForRole(null)       // 'educator'
```

## 8. Ověření: jak by to fungovalo se Supabase

Teď je všechno mock: kód se nikam neposílá, projde jakýchkoliv 6 číslic a doklad jen nastaví stav `pending`.

### Školní e-mail

```
 klient                         Edge Function "send-edu-code"              DB
┌──────────────┐  e-mail      ┌───────────────────────────────────┐
│ Send code    │────────────► │ 1. ověří přihlášeného uživatele   │
└──────────────┘              │ 2. zkontroluje doménu proti       │──► educator_verifications
                              │    institution_domains (na serveru!)   (code_hash, expires_at,
                              │ 3. vygeneruje 6místný kód,        │     attempts)
                              │    uloží jen jeho HASH + expiraci │
                              │ 4. pošle e-mail (Resend apod.)    │
┌──────────────┐  kód         └───────────────────────────────────┘
│ Verify       │────────────► "verify-edu-code": porovná hash, max. 5 pokusů,
└──────────────┘              platnost 15 min → status = verified / pending
```

- Kontrolu domény **nesmí dělat jen klient**: tu jde obejít v devtools. Klient ji ukazuje jen jako nápovědu.
- Kód se v DB ukládá jako hash a s expirací, podobně jako hesla.
- Shoduje-li se doména s `institution_domains` → `verified` automaticky. Ručně zadaná instituce (bez domén) nebo neshoda → `pending` a rozhodne admin.
- Sloupec `status` smí měnit jen Edge Function (service role) nebo admin, ne RLS politika klienta.
- Alternativa: Supabase Auth má vlastní OTP na e-mail (`signInWithOtp`), ale ten by **přihlásil** uživatele jiným e-mailem. Pro ověření druhé adresy je čistší vlastní funkce.

### Doklady

- **Privátní** bucket ve Storage, např. `educator-documents`, cesta `{user_id}/{verification_id}/{soubor}`.
- RLS na `storage.objects`: uživatel smí nahrát a číst jen ve své složce (`(storage.foldername(name))[1] = auth.uid()::text`). Admin čte přes service role v admin-api.
- Admin dokument otevře přes **signed URL** s krátkou platností. Veřejný odkaz na pracovní smlouvu nikdy nevznikne.
- Doklady obsahují osobní údaje, takže po schválení nebo zamítnutí je rozumné je po čase smazat (retence) a v aplikaci držet jen výsledek (`status`, `verified_at`).
