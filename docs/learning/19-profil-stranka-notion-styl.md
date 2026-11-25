# 19 – Profil jako stránka ve stylu Notionu

Starý Profile Builder (seznam karet vlevo, editor vpravo) je nahrazený jednou stránkou, kterou upravuješ přímo na místě, jako v Notionu. Klik na avatar v horní liště vede pořád na `/dashboard/profile-builder`.

## 1. Co uživatel vidí

```
POPRVÉ                                  PO KLIKNUTÍ NA „SET UP“
                                        ┌──────────── banner ────────────┐
                                        └────────────────────────────────┘
        Your profile page                 (avatar)
  A page other people see when…         Martin Mačalík  ← input, kurzor rovnou tady
     [ Set up profile page ]            [☺ Add icon] [▭ Add banner] [≡ Add bio]
                                        bio…
                                        ─────────────
                                         +   ← menu komponent („Coming soon“)
```

- **Nadpis = jméno z Nastavení** (`first_name` + `last_name`). Nejde o nový údaj, je to stejný sloupec jako v Settings → Identity, takže změna tady se projeví i tam a naopak.
- **Ikona = avatar**, **bio = bio**. Obojí je opět stejný sloupec v `profiles`.
- **Banner** je jediná nová věc.
- Tlačítka „Add …“ se ukazují jen u toho, co ještě chybí. Vyplněný banner a avatar mají při najetí myší tlačítka *Change / Remove*.
- Veřejný profil (`/dashboard/profile/:id`): dokud stránka není založená, ukáže se jen „This person hasn't set up their profile page yet.“ (a tlačítko Message, aby šlo pořád napsat).

## 2. Databáze

Migrace [20261125002_profile_page.sql](../../supabase/migrations/20261125002_profile_page.sql). Má číslo `…002`, protože `20261125001` už patří migraci `global_search` ze Smart Search a Supabase bere číselný prefix jako ID verze, takže dvě migrace se stejným číslem by se srazily.

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url              text,
  ADD COLUMN IF NOT EXISTS profile_page_created_at timestamptz;
```

**Proč `timestamptz` a ne `boolean`?** `NULL` znamená „ještě nezaložil“ a vyplněné datum znamená „založil, a víme kdy“. Jeden sloupec tak nese dvě informace.

Migrace navíc nastaví datum všem, kdo už měli karty ze starého builderu. Jinak by jejich veřejný profil přes noc zmizel.

**Banner nepotřebuje nový bucket.** Nahrává se do `avatars/<userId>/…`. Storage politika `auth.uid()::text = (storage.foldername(name))[1]` povoluje zápis jen do vlastní složky a je jí jedno, jestli je soubor avatar, nebo banner.

## 3. Kód

| Soubor | Co dělá |
|---|---|
| [ProfileBuilderPage.tsx](../../apps/web/src/pages/ProfileBuilderPage.tsx) | `SetupPrompt` (první návštěva) a `ProfileEditor` (stránka) |
| [avatarUpload.ts](../../apps/web/src/lib/avatarUpload.ts) | `uploadBanner` / `removeBanner`. `resizeToBlob` dostal parametr `maxDim` (avatar 512 px, banner 1600 px). |
| [PublicProfilePage.tsx](../../apps/web/src/pages/PublicProfilePage.tsx) | banner nahoře + hláška pro nezaložený profil |

### Editace nadpisu jako v Notionu

Nadpis není `<h1>`, ale `<input>` bez rámečku, nastylovaný jako velký nadpis:

```tsx
<input
  onFocus={e => e.target.select()}   // klik = označí celý text, rovnou přepisuješ
  onBlur={saveName}                  // vyklik = uložit
  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
  placeholder="Your name"            // šedý text, dokud je prázdno
  className="bg-transparent outline-none text-4xl font-bold …"
/>
```

`saveName`:
- pole je prázdné → vrátí se uložené jméno (nesmí zůstat bez jména),
- jinak se text rozdělí na první mezeře: `"Martin Mačalík"` → `first_name: "Martin"`, `last_name: "Mačalík"`.

**Automatické zaměření po „Set up“:** rodič si v `useState` pamatuje `justCreated`, které se nastaví jen při kliknutí na tlačítko, a pošle ho dál jako prop `autoFocusName`. Kdyby se to odvozovalo z času v databázi („vytvořeno před méně než 5 s“), rozbilo by se to při pomalém připojení nebo při rozdílném čase na serveru a v prohlížeči.

### Propojení s horní lištou

Po každém uložení se volá `emitAppEvent('profile:refresh')`. [TopBar](../../apps/web/src/components/layout/TopBar.tsx) na ten event poslouchá a znovu načte jméno a avatar. Stránka a lišta se tak neznají, jen si posílají zprávu přes [app-events.ts](../../apps/web/src/lib/app-events.ts).

### Hover tlačítka bez „díry“

```tsx
<div className="group relative">
  <img … />
  <div className="absolute left-full bottom-2 pl-2 opacity-0 group-hover:opacity-100">…</div>
</div>
```

Odsazení od avataru je `pl-2` (padding), ne `ml-2` (margin). Padding patří k elementu, takže když myš přejíždí z avataru na tlačítka, je pořád „uvnitř“ skupiny a tlačítka nezmizí.

### Veřejný profil uvnitř aplikace

Dřív byl `/profile/:id` samostatná celoobrazovková stránka mimo `DashboardLayout`, bez horní lišty a menu. Teď je to vnořená routa:

```tsx
<Route path="/dashboard" element={<DashboardLayout />}>
  …
  <Route path="profile/:id" element={<PublicProfilePage />} />   // → /dashboard/profile/:id
</Route>

<Route path="/profile/:id" element={<LegacyProfileRedirect />} /> // staré odkazy → přesměrování
```

`LegacyProfileRedirect` přečte `:id` přes `useParams` a vrátí `<Navigate replace />`. `replace` znamená, že stará adresa nezůstane v historii, takže tlačítko Zpět nevede do smyčky přesměrování. Odkazy v Discover, v GlobalSearch (Smart Search), v hlavičce chatu a v TeachersWidget míří rovnou na novou adresu.

Veřejný profil používá **stejné rozměry a třídy jako editor** (banner `h-48`, avatar `h-24 -mt-12`, jméno `text-4xl`, `max-w-3xl`). Proto v editoru není tlačítko „View public profile“: editor sám je přesný náhled.

## 4. Co dál (zítra)

- Menu **+** → komponenty. Staré soubory `components/profile-builder/SortableCardList.tsx` a `CardEditorPanel.tsx` i tabulka `profile_cards` zůstaly beze změny a dají se na to využít.
- Veřejný profil už staré karty zobrazuje pod hlavičkou.
