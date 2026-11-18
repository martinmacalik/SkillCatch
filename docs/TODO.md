# TODO

## Learning Tracker: automatický tracker místo stopek

Hotovo (viz `docs/learning/14-automaticky-learning-tracker.md`):
- [x] Čas v aplikaci se počítá sám (karta musí být viditelná), ukládá se po dnech.
- [x] Streak = dny s 10+ minutami v aplikaci (nahradil streak z přihlášení).
- [x] Čas na skill se počítá na `/dashboard/learn/:skillId`.
- [x] Widget na dashboardu: jen dnešek, první slide = aplikace, šipky nahoru/dolů na dnešní skilly.

Zbývá:
- [x] Migrace `20261118001_activity_tracking.sql` spuštěná v Supabase.
- [ ] **Heatmapa** (Learning Progress, `ActivityHeatmap`) čte jen `time_sessions` ze stopek. Napojit ji i na `user_daily_activity` / `user_skill_daily_time`, aby ukazovala automatický čas.
- [ ] Stopky (`TimeTrackerCard`, `SessionSummaryModal`, RPC `timer_*`) na dashboardu nahradil automatický widget. Rozhodnout, jestli je smazat, nebo je dát jinam (např. na learn stránku pro učení mimo aplikaci). Totéž XP za session.
- [ ] Vyzkoušet v prohlížeči: 10 min → plamínek se rozsvítí, streak +1; přepínání slidů; půlnoc.
- [ ] **Roční widget**: přehled celého roku z `user_daily_activity` (a `user_skill_daily_time`), zatím neexistuje.
- [ ] Rozhodnout, co s tabulkou `user_login_days`. Do ní už nic nezapisujeme, stará data zůstávají.
- [ ] Profilové stránky (`/profile`) jsou mimo `/dashboard`, čas na nich se ale počítá taky (tracker běží v `App`). Ověřit, že je to tak chtěné.
