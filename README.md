# Komunikační Spojovatel PEF

**Identifikátor:** `pef_komunikace_spojovatel`  
**Autor:** Patrik Broniek

Logická hra na téma digitální komunikace. Hráč otáčí klikáním segmenty kabelů v mřížce 10×10 a snaží se propojit START `[0,0]` s CÍL `[9,9]` v co nejkratším čase.

## Spuštění

**Lokálně** – otevřít `index.html` přímo v prohlížeči (hra funguje offline, skóre se ukládá do LocalStorage).

**Se serverem** – nasadit na PHP 8.x + MySQL/MariaDB, spustit `db_setup.sql`, upravit přihlašovací údaje v `api/db.php`.

## Struktura

```
index.html        – klient (hra)
style.css / game.js
api/
  init_game.php   – generuje puzzle, vrací layout + instance_id
  save_score.php  – ověřuje a ukládá čas (SHA-256 hash)
  leaderboard.php – top 10 hráčů seřazených ASC podle času
  profanity.php   – filtr nevhodných jmen (CS + EN)
  db.php          – PDO připojení k DB
db_setup.sql      – schéma tabulky game_instances
```

## Vyhodnocení

Čas v milisekundách, řazení **ASC** (kratší = lepší). Server ověřuje čas i hash před uložením.
