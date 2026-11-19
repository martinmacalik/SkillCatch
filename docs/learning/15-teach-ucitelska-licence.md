# 15 – Teach: stránka s učitelskou licencí

## 1. Co bylo uděláno

Nová stránka **Teach** (`/dashboard/teach`, v menu pod Discover, ikona `GraduationCap`). Uživatel si na ní vytvoří **učitelskou licenci**: pohlednici, která funguje jako vizitka učitele a ukazuje skilly, které umí natolik, že je může učit.

Stránka má tři stavy:

```
 nemám licenci                 tvorba / úprava                     mám licenci
┌───────────────────┐        ┌──────────────┬──────────────┐      ┌──────────────────┐
│ ┌ ─ ─ ─ ─ ─ ─ ─ ┐ │ Create │  ŽIVÝ NÁHLED │  FORMULÁŘ    │ Save │   velká          │
│   You don't have  │ ─────► │  pohlednice  │  1 About you │ ───► │   pohlednice     │
│   a license yet   │        │  (sticky)    │  2 Skills    │      │  [Edit license]  │
│ └ ─ ─ ─ ─ ─ ─ ─ ┘ │        │              │  3 Theme     │ ◄─── │  přehled skillů  │
└───────────────────┘        └──────────────┴──────────────┘ Edit └──────────────────┘
                               (na mobilu je náhled nad formulářem)
```

Žádná databáze, žádné volání Supabase. Všechno žije v Reactu (`useState`) a po odchodu ze stránky zmizí. To je záměr: datová vrstva se doplní později.

## 2. Soubory

| Soubor | K čemu slouží |
|---|---|
| `apps/web/src/types/teaching.ts` | typy `TeacherLicense`, `LicenseSkill`, `LicenseEvidence`, `LicenseStatus`, `EvidenceType`, `EvidenceKind` + popisky |
| `apps/web/src/hooks/useTeacherLicense.ts` | „úložiště“ licence + správa `blob:` URL |
| `apps/web/src/pages/TeachPage.tsx` | stránka: rozhoduje, který ze tří stavů ukázat, drží rozpracovaný draft |
| `apps/web/src/components/teach/LicenseCard.tsx` | pohlednice (papír, známka s fotkou, poštovní razítko, razítka skillů) |
| `apps/web/src/components/teach/LicenseForm.tsx` | formulář: osobní údaje, skilly, motiv, tlačítka |
| `apps/web/src/components/teach/SkillProofEditor.tsx` | jeden skill: úroveň + seznam důkazů + přidání důkazu |
| `apps/web/src/components/teach/EmptyLicenseState.tsx` | šedá „prázdná pohlednice“ s tlačítkem Create license |
| `apps/web/src/components/teach/StatusBadge.tsx` | odznak Draft / Pending / Verified |
| `apps/web/src/components/teach/teach-utils.ts` | motivy karty, mock skilly, pomocné funkce |
| `App.tsx`, `Sidebar.tsx`, `BottomNav.tsx` | route + položka v menu (desktop i mobil) |
## 3. Struktura komponent

```
TeachPage                      ← drží `draft` (rozpracovaná kopie) a volá useTeacherLicense()
├── EmptyLicenseState          ← když licence není a needituje se
├── LicenseOverview            ← když licence je (malá komponenta uvnitř TeachPage)
│   ├── LicenseCard
│   └── StatusBadge
└── (editace)
    ├── LicenseCard            ← náhled, dostává `draft`
    └── LicenseForm            ← formulář, dostává `draft` + onChange
        └── SkillProofEditor   ← jeden pro každý skill
            ├── EvidenceRow    ← řádek důkazu (miniatura / ikona, typ, datum, smazat)
            └── AddEvidenceForm
```

`LicenseCard` je **čistě zobrazovací**: dostane licenci a vykreslí ji, nic nemění. Proto jde stejná komponenta použít jako živý náhled i jako výsledná velká karta.

Pohlednice používá **container queries** (`@container`, `@lg:text-3xl` …). Neřídí se šířkou okna, ale šířkou svého rodiče. V úzkém sloupci vedle formuláře i ve velkém zobrazení uprostřed se tak sama přizpůsobí.

## 4. Jak teče stav mezi formulářem a náhledem

Klíčový princip je **zvednutý stav** (lifting state up). Formulář si licenci *nedrží sám*; drží ji jejich společný rodič `TeachPage`:

```tsx
const [draft, setDraft] = useState<TeacherLicense | null>(null)

<LicenseCard license={draft} />                     // čte
<LicenseForm value={draft} onChange={setDraft} />   // čte i zapisuje
```

```
  píšu do pole Title
        │
        ▼
 LicenseForm: onChange({ ...value, title: 'Coach' })     ← nový objekt, starý se nemění
        │
        ▼
 TeachPage: setDraft(nový objekt)  ──► React překreslí TeachPage
        │                                   │
        ▼                                   ▼
 LicenseForm dostane nový value      LicenseCard dostane nový license
```

Proto se náhled mění okamžitě, při každém stisku klávesy. Formulář je tzv. **controlled component**: jeho hodnoty vždy pocházejí z props.

Stejný vzor se opakuje o úroveň níž: `SkillProofEditor` dostane jeden `skill` a vrací upravený přes `onChange(skill)`. `LicenseForm` ho vymění v poli `skills` (`map` + porovnání `id`).

**Draft vs. uložená licence.** `draft` je pracovní kopie. Uložená licence (`license` v hooku) se změní až po *Save draft* / *Submit for review*. *Cancel* tedy jen zahodí draft (`setDraft(null)`) a uložená verze zůstane, jak byla. Díky neměnným (immutable) aktualizacím (`{ ...value, … }`) draft nikdy omylem nepřepíše uložený objekt.

**Submit for review** je povolený, jen když má licence aspoň jeden skill a každý skill aspoň jeden důkaz (`canSubmit()`). U skillu bez důkazu je žluté upozornění. Kliknutí zatím jen nastaví stav `pending` v lokálním stavu.

## 5. Náhled souborů přes `URL.createObjectURL`

Když uživatel vybere soubor (`<input type="file">`), dostaneme objekt `File`. Ten neumí `<img src>` zobrazit přímo. Nechceme ho ale ani nahrávat na server jen kvůli náhledu.

```ts
const url = URL.createObjectURL(file)   // "blob:http://localhost:5173/9f1c…"
<img src={url} />
```

Prohlížeč vytvoří **dočasnou adresu, která ukazuje na soubor v paměti**. Nic se nikam neposílá a je to okamžité.

### Proč `URL.revokeObjectURL`

Dokud adresa existuje, prohlížeč musí držet celý soubor v paměti, protože neví, jestli ho ještě někdo nepoužije. Garbage collector to za nás neuklidí. 10 fotek z mobilu po 5 MB = 50 MB, které visí v paměti až do zavření záložky. Proto se adresa musí ručně uvolnit:

```ts
URL.revokeObjectURL(url)   // od teď je blob: adresa mrtvá a paměť se uvolní
```

### Kdy přesně uvolňujeme

Pravidlo zní: *uvolnit, až ji nic nezobrazuje*. To hlídá hook `useTeacherLicense`, který si vede seznam všech vytvořených adres (`liveUrls`):

| Situace | Co se stane |
|---|---|
| smažu důkaz / vyměním fotku | `releasePreviewUrl(url)` → revoke, **pokud** ji nemá uložená licence |
| *Save draft* / *Submit* | revoke všech adres, které nová uložená licence nepoužívá |
| *Cancel* | revoke všech adres, které nepoužívá uložená licence (patřily jen zahozenému draftu) |
| odchod ze stránky (unmount) | revoke úplně všech |

Proč výjimka „pokud ji nemá uložená licence“? Upravuju uloženou licenci, smažu v draftu fotku a dám *Cancel*. Uložená licence pořád tu fotku zobrazuje. Kdybychom adresu zrušili hned, v kartě by zůstal rozbitý obrázek.

Drobnost v `AddEvidenceForm`: vybraný soubor tam čeká jen jako `File` a `createObjectURL` se zavolá až po kliknutí na *Add proof*. Když uživatel výběr zruší, žádná adresa nevznikne, takže není co uklízet.

## 6. Typy navržené pro budoucí tabulky

```
teacher_licenses              license_skills                 license_evidence
─────────────────             ──────────────────             ─────────────────────
id                  ◄──┬───── license_id                     id
user_id → profiles     │      id                  ◄───────── license_skill_id
title_before           │      skill_node_id → skill_nodes    kind   (image|video|pdf|link)
title_after            │      level                          type   (certificate|competition|home_showcase)
role                   │      status                         url
country_code           │                                     file_name
institution_type       │                                     description
institution_id         │      educator_verifications         date
institution_name       │      ──────────────────────         created_at
institution_domains    └───── license_id (unique)
bio                           kind     (educator|student)
                              method   (email|document)
photo_url                     status   (none|pending|verified)
theme                         email
status                        document_url, document_file_name
created_at, updated_at        submitted_at, verified_at
```

`institution_name` se ukládá i u instituce vybrané ze seznamu. Je to „snímek“: když se seznam škol příště přegeneruje a škola se přejmenuje nebo zanikne, karta pořád ukazuje to, co uživatel vybral. `institution_id` pak slouží jen jako odkaz.

Každé pole v TS odpovídá sloupci (jen `camelCase` → `snake_case`). Hodnoty enumů jsou už teď v `snake_case` (`'home_showcase'`), aby šly uložit beze změny. Pole `file` a `photoFile` jsou označená jako **client-only**, do databáze nepůjdou.

## 7. Co bude potřeba při napojení na Supabase

1. **Migrace**: tři tabulky výše + enumy (`license_status`, `teaching_level`, `evidence_type`, `evidence_kind`), cizí klíče s `on delete cascade`.
2. **RLS**: uživatel čte a upravuje jen svou licenci. Měnit `status` na `verified` / `rejected` smí jen admin (ideálně přes admin-api, ne z klienta). Klient smí jen `draft` → `pending`.
3. **Storage**: bucket (např. `license-evidence`, privátní) pro fotky a důkazy. Při uložení se `File` nahraje, do `url` se zapíše cesta ve Storage a `blob:` adresa se revokne. Privátní soubory se pak zobrazují přes signed URL.
4. **Hook**: `useTeacherLicense` se přepíše tak, aby načetl licenci při mountu a `saveDraft` / `submitForReview` dělaly insert/upsert do tří tabulek. Rozhraní hooku (`license`, `saveDraft`, `submitForReview`, …) může zůstat stejné, takže `TeachPage` a formuláře se skoro nezmění. Přibude jen `loading` / `error`.
5. **Mazání**: smazaný skill nebo důkaz v draftu = při uložení smazat řádky (a soubory ve Storage), které v draftu už nejsou.
6. **Skilly**: `MOCK_USER_SKILLS` nahradit skutečnými skilly z `user_skills` + `skill_nodes` a do `skillNodeId` ukládat `skill_nodes.id`.
7. **Jméno** se teď bere ze session (`user_metadata`). Později z tabulky `profiles`.
8. **Admin**: v adminu přidat frontu licencí ve stavu `pending` se schválením / zamítnutím.
9. **Instituce, tituly, ověření učitele**: viz navazující poznámka [16-teach-instituce-tituly-overeni.md](16-teach-instituce-tituly-overeni.md).
