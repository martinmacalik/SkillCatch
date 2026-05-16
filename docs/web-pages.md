# Technická dokumentace stránek — apps/web

Tento dokument popisuje technické fungování jednotlivých stránek aplikace: strukturu komponent, správu stavu, datové toky a side effects. Doplňuje sekci 6.1 obecné dokumentace.

---

## Routing

Routing je definován v `apps/web/src/App.tsx` pomocí `react-router-dom`. Aplikace má dvě hlavní zóny:

| Zóna | Cesta | Ochrana |
|---|---|---|
| Veřejná | `/`, `/signin`, `/auth/callback`, `/profile/:id` | — |
| Chráněná (dashboard) | `/dashboard/*` | `ProtectedRoute` → přesměrování na `/signin` |

Všechny chráněné routes jsou nested pod `/dashboard` a sdílejí `DashboardLayout`, který renderuje persistent shell (sidebar, bottom nav, top bar) a do něj vkládá aktuální stránku přes `<Outlet />`.

---

## SignInPage

**Soubor:** `apps/web/src/pages/SignInPage.tsx`  
**Route:** `/signin` (veřejná)

### Stav

```
isLogin: boolean            — přepíná mezi formulářem registrace a přihlášení
formData: object            — firstName, lastName, email, password, agreeToTerms
loading: boolean            — deaktivuje tlačítko po dobu async operace
message: { type, text }     — zobrazuje inline success/error feedback
showResendButton: boolean   — zobrazí tlačítko pro opětovné odeslání ověřovacího e-mailu
resendEmail: string         — cachuje e-mail pro funkci resend
```

### Polling mechanismus

Po úspěšném volání `supabase.auth.signUp()` aplikace nečeká na email redirect — místo toho spustí interval (každé 3 sekundy) přes `setInterval`, uložený do `pollIntervalRef`. V každém tiknutí se pokusí zavolat `supabase.auth.signInWithPassword()` s uloženými credentials (`pendingCredentialsRef`). Pokud Supabase vrátí platnou session, znamená to, že uživatel mezitím potvrdil e-mail v jiném okně nebo záložce. Interval se pak vyčistí, provede se upsert profilu a uživatel je přesměrován na `/dashboard`.

```
signUp() → zobraz zprávu → startVerificationPolling()
                                  ↓
                         interval každé 3s
                                  ↓
                  signInWithPassword() → session? → upsert profile → navigate('/dashboard')
```

Interval je vyčištěn v cleanup funkci `useEffect` (při unmount komponenty), aby nedocházelo k memory leaku.

### Upsert profilu po registraci

Po potvrzení e-mailu se zavolá `supabase.from('profiles').upsert()` s daty z `user.user_metadata` (firstName, lastName nastavené při `signUp` přes `options.data`). Conflict target je `id`, takže pokud profil již existuje, aktualizuje se.

### Layout

Komponenta je rozdělena na `<LeftPanel />` a `<RightPanel />`. `LeftPanel` je viditelný pouze na desktopu (breakpoint `min-[1095px]`) a zobrazuje animovaný `ShaderGradient` z knihovny `@shadergradient/react`. Na mobilních zařízeních je stejný gradient vykreslen jako absolutně pozicované pozadí celé stránky, zatímco formulář je v bílé kartě s `rounded-[35px]`.

### OAuth flow

Tlačítka Google a GitHub volají `supabase.auth.signInWithOAuth()` s `redirectTo` nastaveným na `${window.location.origin}/auth/callback`. Dokončení přihlášení obstarává `AuthCallback` komponenta na route `/auth/callback`.

---

## DashboardPage

**Soubor:** `apps/web/src/pages/DashboardPage.tsx`  
**Route:** `/dashboard` (index)

### Stav

```
totalSkills: number         — celkový počet řádků uživatele v tabulce user_skills
learningCount: number       — počet řádků se status = 'learning'
dayStreak: number           — počet po sobě jdoucích přihlašovacích dní
pinnedSkills: SkillNode[]   — max 3 dovednosti s pinned = true
learningSkills: SkillNode[] — všechny dovednosti se status = 'learning'
editingNode: object | null  — řídí otevření EditSkillModal
```

### Data fetching

Veškerý fetch probíhá v jediném `useEffect` závislém na `session`. Obsahuje čtyři sekvenční dotazy:

1. **user_skills** — načte všechny řádky uživatele, vypočítá `totalSkills` a `learningCount`, odfiltruje `pinnedRows` (max 3).
2. **skill_nodes** — načte data uzlů pro sjednocení IDček z learning + pinned pomocí `Set` (aby nedošlo k duplicitním dotazům).
3. **user_login_days upsert** — zapíše dnešní datum (`new Date().toISOString().slice(0, 10)`) s `onConflict: 'user_id,login_date'`, takže každý den je zapsán nejvýše jednou.
4. **user_login_days select** — načte historii přihlášení seřazenou sestupně a předá ji funkci `calcStreak`.

### Výpočet streaku

Funkce `calcStreak(dates: string[])` iteruje přes pole dat seřazených od nejnovějšího a počítá, kolik po sobě jdoucích dní má rozdíl přesně 1 den. Výpočet se zastaví při první mezeře větší než 1 den.

### Grid layout

Mřížka druhé a třetí vrstvy používá `grid-cols-6` se čtyřmi řádky na breakpointu `2xl`. Na menších rozlišeních se přepíná na `grid-cols-2` (tablet) a `grid-cols-1` (mobil). Každá buňka má explicitní `col-start`, `col-span`, `row-start`, `row-end` pro každý breakpoint. Toto je nutné, protože asymetrické rozložení nelze vyjádřit jednoduchým auto-flow.

### EditSkillModal

Modal pro editaci dovednosti se renderuje podmíněně (mimo grid) v kořeni stránky, nikoli uvnitř buňky gridu. Důvod je zamezení overflow clippingu způsobeného `overflow-hidden` na rodičovských elementech. `editingNode` drží referenci na `SkillNode` a jeho index pro předání do modalu.

---

## LearnPage

**Soubor:** `apps/web/src/pages/LearnPage.tsx`  
**Route:** `/dashboard/learn` a `/dashboard/learn/:skillId`

LearnPage je nejkomplexnější stránka aplikace. Obsahuje tři záložky (Start Learning, Level Up, Progress), dva editační režimy a pravý panel s překryvným přepínačem.

### Stav

```
activeSkillId: string | null         — ID aktuálně zobrazené dovednosti
data: PageData | null | 'missing' | 'empty'
                                     — union type pro řízení render stavů:
                                       null = načítání, 'empty' = žádné learning skills,
                                       'missing' = skill nenalezen, PageData = úspěch
learningSkills: UserLearningSkill[]  — všechny skills uživatele pro pravý panel
editMode: 'idle' | 'direct' | 'suggestion'
tabEditing: boolean                  — editace záložek Level Up / Progress (oddělen od editMode)
draftBlocks: DraftBlock[]            — lokální kopie bloků v suggestion módu
suggestionMessage: string            — volitelná zpráva přiložená k návrhu
pendingSuggestion: object | null     — aktivní nerozhodnutý návrh uživatele
showInfoPanel: boolean               — zobrazení EditInfoPanel (přehled typů bloků)
submitting: boolean                  — loader při odesílání suggestion
```

### Tři oddělené useEffect bloky

**1. Resoluce activeSkillId**
```
deps: [skillIdParam, navigate]
```
Pokud je `skillIdParam` přítomen v URL, nastaví ho jako aktivní. Jinak zavolá `getDefaultLearnSkillId()` — databázová funkce vrátí ID dovednosti s nejnovějším `last_opened_at`. Pokud žádná learning skill neexistuje, nastaví `data = 'empty'`.

**2. Fetch dat pro aktivní skill**
```
deps: [activeSkillId]
```
Načte stránku a bloky přes `getSkillLearnPageById()`, zkontroluje pending suggestion přes `getMyPendingSuggestion()` a zavolá `touchSkillLastOpened()`, která aktualizuje `last_opened_at` — tím udržuje správné řazení v navigaci.

**3. Fetch learning skills pro pravý panel**
```
deps: [session.user.id]
```
Závisí na session, nikoli na activeSkillId — seznam skills v pravém panelu se tedy přenačítá pouze při změně uživatele, ne při přepínání mezi skills.

### Editační režimy

**Direct mode** (role `admin` nebo `editor`):
- Při vstupu lazy-vytvoří page row pokud neexistuje (`ensureLearningPage`)
- Každá změna bloku se okamžitě propaguje do databáze (`updateLearningBlock`, `createLearningBlock`, `deleteLearningBlock`)
- Editor může přepínat stav stránky mezi `draft` a `published`

**Suggestion mode** (běžný uživatel):
- Při vstupu se vytvoří deep copy bloků do `draftBlocks`
- Všechny mutace probíhají pouze lokálně v React state
- Při odeslání se payload sestaví z `draftBlocks`: bloky bez `isLocal` si zachovají `id` (označení pro update existující), nové bloky bez `id` (označení pro create), chybějící bloky = delete
- Výsledek se uloží přes `submitLearningSuggestion()` a uživatel vidí badge "awaiting review"
- Pokud pending suggestion existuje, tlačítko Edit je disabled

### Přepínání záložek

Aktivní záložka je uložena v URL search parametru `?tab=start|levelup|progress` přes `useSearchParams`. Při přepnutí záložky se resetuje `tabEditing` (via useEffect závislý na `activeTab`), ale `editMode` pro Start Learning zůstane nedotčen — záložky sdílejí URL ale mají oddělené editační stavy.

### LevelUpPage a ProgressPage jako tab-content

`LevelUpPage` a `ProgressPage` jsou samostatné komponenty importované do `LearnPage` a renderované podmíněně podle `activeTab`. Přijímají `skillNodeId` a `isEditing` jako props — `isEditing` je řízen stavem `tabEditing` v `LearnPage`, nikoli vnitřním stavem komponenty.

### LearnRightPanel

Pravý panel (`w-72 shrink-0`) má dva scény přepínané CSS transformací:

- **Widget bar** (výchozí): `NavigationWidget` (TOC z headingů bloků) + `TeachersWidget`
- **Learning list** (overlay): `LearningSkillsList` se seznamem všech learning skills

Overlay je absolutně pozicován přes widget bar a přesouvá se pomocí `translate-x` (`translate-x-0` / `translate-x-[110%]`). Oba stavy jsou trvale mountovány (žádný conditional render), takže přepnutí nespouští refetch dat.

---

## LevelUpPage

**Soubor:** `apps/web/src/components/learn/LevelUpPage.tsx`  
**Renderována jako:** tab-content uvnitř `LearnPage` při `activeTab === 'levelup'`

### Stav

```
levels: SkillLevel[]        — seřazený seznam úrovní pro daný skill
myLevelId: string | null    — ID úrovně, kterou si uživatel nárokoval
expanded: Set<string>       — IDčka rozbalených karet (multi-expand)
editingId: string | null    — ID úrovně v inline editaci
editDraft: Partial<SkillLevel>
                            — pracovní kopie editované úrovně
addingNew: boolean          — zobrazení formuláře pro novou úroveň
newName: string             — vstup pro název nové úrovně
```

### Data fetching

`useEffect` závislý na `skillNodeId` načítá data paralelně přes `Promise.all`:
- `getSkillLevels(skillNodeId)` — všechny úrovně seřazené podle `sort_order`
- `getMySkillLevel(skillNodeId)` — uživatelův záznam z tabulky `user_skill_levels`

Po načtení je automaticky rozbalena (`expanded`) úroveň, kterou má uživatel nárokovanou.

### Claim/Unclaim mechanismus

Funkce `handleClaim(levelId)` je toggle — pokud je `myLevelId === levelId`, volá `unclaimSkillLevel()` a nastaví `myLevelId = null`. Jinak volá `claimSkillLevel()`. Uživatel může mít naráz nejvýše jednu nárokovanou úroveň per skill (vynuceno unikátním indexem v DB).

### Inline editace

Editace probíhá přímo v kartě bez modalu. Při vstupu (`startEdit`) se hodnoty zkopírují do `editDraft`. Komponenta pak podmíněně renderuje buď `<input>` (v editaci) nebo `<span>` (zobrazení). Kritéria jsou uložena jako `criteria: { text: string }[]` v JSONB sloupci — ve stavu jsou reprezentována jako pole objektů a mutována přes index.

---

## ProgressPage

**Soubor:** `apps/web/src/components/learn/ProgressPage.tsx`  
**Renderována jako:** tab-content uvnitř `LearnPage` při `activeTab === 'progress'`

### Stav

```
items: ProgressItem[]       — všechny položky checklistu pro daný skill
checked: Set<string>        — IDčka zaškrtnutých položek pro aktuálního uživatele
editingId, editText, editSection
                            — inline editace jednotlivé položky
addingSection: string | null
                            — název sekce, do které se přidává nová položka
renamingSection: string | null
addingNewSection: boolean
showImport: boolean         — zobrazení JSON import modalu
importJson: string
```

### Datová struktura sekcí

Položky (`ProgressItem`) neobsahují referenci na parent objekt sekce — sekce je pouze string atribut každé položky (`item.section`). Seskupení do sekcí se provádí na frontendu pomocí `useMemo` přes `Map<string, ProgressItem[]>`. Pořadí sekcí je určeno pořadím prvního výskytu v seřazeném poli (podle `sort_order`).

### Per-user checkboxy

Zaškrtnutí položek je uloženo v separátní tabulce (vazební tabulka uživatel–položka). `getMyProgressChecks()` vrátí `Set<string>` s IDčky zaškrtnutých položek pro přihlášeného uživatele. Toggle přes `handleToggle()` optimisticky aktualizuje lokální `Set` a asynchronně zapíše do DB.

### JSON import

Editor může hromadně importovat položky vložením JSON ve tvaru:
```json
[
  { "section": "Název sekce", "items": ["položka 1", "položka 2"] }
]
```
Před importem proběhne validace struktury (array, string section, array of strings items). Import probíhá sekvenčně přes smyčku `for...of` — nikoli paralelně — aby bylo zachováno pořadí `sort_order` v rámci sekce. Existující položky v sekci nejsou mazány; nové jsou přidány za ně.

---

## SettingsPage

**Soubor:** `apps/web/src/pages/SettingsPage.tsx`  
**Route:** `/dashboard/settings`

Stránka je tenký wrapper, který předává `userId` do tří samostatných sekčních komponent. Nemá vlastní stav ani side effects.

### IdentitySection

**Soubor:** `apps/web/src/components/settings/IdentitySection.tsx`

Spravuje veřejný profil uživatele. Při načtení fetches řádek z tabulky `profiles` a uloží ho do `original` (neměnná reference) i `row` (pracovní kopie). Tlačítko Save je aktivní pouze pokud `JSON.stringify(row) !== JSON.stringify(original)` (`dirty` flag) a zároveň nejsou validační chyby.

Username je validován pomocí `validateUsername()` z `lib/usernameRules` (pravděpodobně regex pro povolené znaky a délku). Při chybě PostgreSQL s kódem `23505` (unique violation) se zobrazí specifická hláška "That username is taken" místo generické chybové zprávy z Supabase.

Bio má limit 160 znaků s live counterem. Pokud `bioLen > 160`, counter zčervená a Save se zablokuje.

`AvatarUploader` spravuje upload avataru samostatně — po úspěšném uploadu zavolá `onChange(url)`, který aktualizuje `row.avatar_url` i `original.avatar_url` najednou. Tím se zabráni zbytečnému zobrazení Save tlačítka jen kvůli změně avataru.

### AccountSection

**Soubor:** `apps/web/src/components/settings/AccountSection.tsx`

Zobrazuje readonly informace o účtu: e-mail (ze session), metoda přihlášení (detekována přes `session.user.identities` — hledá providera `'google'`), datum vytvoření (z `profiles.created_at`).

Reset hesla volá `supabase.auth.resetPasswordForEmail(email)` a po odeslání deaktivuje tlačítko (stav `passwordEmailSent`). Smazání účtu je podmíněno potvrzovacím modalem `DeleteAccountModal`.

### PreferencesSection

**Soubor:** `apps/web/src/components/settings/PreferencesSection.tsx`

Spravuje dvě kategorie preferencí:

**Téma:** Přepíná mezi `'light'`, `'dark'`, `'system'` přes `useTheme()` hook z `ThemeProvider`. Stav tématu je persistován mimo tento komponent.

**Notifikace:** Tři boolean sloupce v tabulce `profiles` (`notif_weekly_digest`, `notif_qa_answers`, `notif_proposal_updates`). Každý toggle okamžitě zapisuje změnu do DB bez extra potvrzení — optimistický update přes lokální `setNotif()` s následným `supabase.from('profiles').update()`.

---

## DiscoverPage

**Soubor:** `apps/web/src/pages/DiscoverPage.tsx`  
**Route:** `/dashboard/discover`

### Stav

```
people: UserProfile[]       — výsledky vyhledávání (max 40 profilů)
peopleQuery: string         — aktuální vyhledávací dotaz
peopleLoading: boolean
firstName: string           — jméno přihlášeného uživatele pro personalizovaný pozdrav
```

### Vyhledávání

`useEffect` závislý na `peopleQuery` spouští nový Supabase dotaz při každé změně vstupního pole (bez debounce). Dotaz používá Supabase PostgREST operátor `.or()` s `ilike` pro case-insensitive full-text hledání přes tři sloupce: `first_name`, `last_name`, `username`. Výsledky jsou limitovány na 40 a seřazeny podle `first_name`.

Pokud je `peopleQuery` prázdný string, podmínka `.or()` se nepřidává a dotaz vrátí prvních 40 profilů seřazených abecedně.

### Personalizovaný pozdrav

Při mountu se načte `first_name` přihlášeného uživatele z tabulky `profiles`. Pokud není dostupný, zobrazí se fallback `"explorer"`.
