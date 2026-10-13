# ZE Graph Website
![Code Size](https://img.shields.io/github/languages/code-size/InterStella0/zegraph-web?style=flat)
![TypeScript React](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=TypeScript%20React&type=TSX)
![Rust](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=Rust&type=Rust)
![JavaScript](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=JavaScript&type=JavaScript)
![SQL](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=SQL&type=SQL)
![Total line of code](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=Total)

> [!TIP]
> Live at **https://zegraph.xyz** [ⓘ](https://zegraph.xyz "smol vps, be nice :)")

## Description
This track all CS Zombie Escape related servers that I’m aware of, allowing you to view player playtime on each server. 
It was originally created to monitor only the GFL Zombie Escape server, but has since expanded to include several 
servers in the western community. Chinese servers are not tracked due to technical limitations on their servers. Only GFL and 
Mapeadores servers provide Steam IDs, enabling consistent tracking of individual players. Other servers rely solely 
on player names for tracking. Any request for me to track your own server, you can contact me through the provided email
address on the website.

This is codebase is purely for displaying data from the database. Itself does
not store the player data and webscraping. Those are hidden. If you wish to host your own, you would need to implement
your own datascraping mechanism.

## How it works
The scraper (hidden) pulls from all the sources below and dumps everything into the database (PostgreSQL). The backend (Rust) does
the heavy queries on top of it and caches the results in redis so the smol vps doesn't die. The frontend (Next.js)
is the website you see. Radar maps are rendered by QGIS straight from PostGIS, and profile pictures come from 
multiple sources that i wrote originally in Python. Literally ported to Rust for that service tbh.

```mermaid
flowchart LR
  %% Scraper sources
  subgraph EXS["🔗 Scraper Sources"]
    direction TB
    SteamA2s("Steam A2S")
    GFLAPI("GFL API")
    GFLBans("GFLBans")
    Nide("Nide.GG")
    Cola("Cola Team Bans")
    MusicNames("GitHub Music-Names")
    YouTube("Youtube API v3")
    SteamAPI("Steam API")
  end

  %% Scraper & Database
  subgraph DSDB["🗄️ Scraper & Database"]
    direction TB
    DataScraper("Data Scraper (Hidden)")
    Database[("PostgreSQL")]
  end

  %% Backend sources
  subgraph EXB["🔗 Backend Sources"]
    direction TB
    ExternalProfileProvider("External Profile Provider")
    Vauff("Vauff.com")
    S2ZE("s2ze.com")
  end

  %% Backend & GIS
  subgraph BE["🖥️ Backend Services"]
    direction TB
    ProfileProvider("Profile Picture Provider")
    Backend("Backend")
    QGIS("QGIS Server")
  end

  %% Frontend
  subgraph FE["🌐 Frontend"]
    direction TB
    Website("The Website")
  end

  %% Scraper inputs
  SteamA2s       ==>|Players & Map| DataScraper
  GFLAPI         ==>|Match Score & Misc data| DataScraper
  GFLBans        ==>|Players & Infraction| DataScraper
  Nide           ==>|Players & Infraction| DataScraper
  Cola           ==>|Players & Infraction| DataScraper
  MusicNames     ==>|Map Music| DataScraper
  YouTube        ==>|Map Music Video| DataScraper
  SteamAPI       ==>|Location| DataScraper

  %% Profile + backend inputs
  SteamAPI                ==> ProfileProvider
  ExternalProfileProvider ==> ProfileProvider
  Vauff          ==>|Map Images| Backend
  S2ZE           ==>|Map Metadata| Backend

  %% Core flow (left to right)
  DataScraper    <==> Database
  Database       ==>|Heavy Query| Backend
  Backend        ==>|Write Only| Database
  Database       ==>|PostGIS| QGIS
  ProfileProvider ==>|Image URL| Backend
  Backend        <==> Website
  QGIS           ==>|WMS| Website

  %% Node styles
  classDef fe fill:#e1f5fe,stroke:#0277bd,stroke-width:2px,color:#000000
  classDef be fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000000
  classDef db fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000000
  classDef ex fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000

  class Website fe
  class Backend,QGIS,ProfileProvider be
  class DataScraper,Database db
  class ExternalProfileProvider,MusicNames,YouTube,SteamAPI,SteamA2s,GFLBans,Vauff,S2ZE,GFLAPI,Nide,Cola ex

  %% Subgraph styles
  style FE fill:#e1f5fe,stroke:#0277bd,stroke-width:2px,color:#000000
  style BE fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000000
  style DSDB fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000000
  style EXS fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
  style EXB fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
```
## Deploy
1. Get a PostgreSQL with PostGIS and pg_cron extensions, then run `db.sql` on it.
2. Copy `default.env` to `.env` and fill it in. Inside docker, `localhost` is the container itself, so point
   `REDIS_URL` at `redis://redis:6379/` and `DB_HOST` at `host.docker.internal` if postgres is on the host.
3. Generate VAPID keys for push notifications, and point `VAPIDS_PATH` at `./vapids`:
   ```bash
   openssl ecparam -genkey -name prime256v1 -out vapids/vapid_private.pem
   openssl ec -in vapids/vapid_private.pem -pubout -out vapids/vapid_public.pem
   ```
4. Running it
   ```bash
   docker compose up --build -d                  # production, on port 51020
   docker compose -f compose.dev.yaml up --build # development, on port 3002
   ```

How I actually deploy it (swarm, staging, CI) is all in [deployment/README.md](deployment/README.md).

## Preview
<a href="assets/img.png"><img src="assets/img.png" alt="Main Page"></a>

<details>
<summary><b>More pages</b></summary>
<br>

<table>
  <tr>
    <td align="center"><a href="assets/server.png"><img src="assets/server.png" alt="Server Page"></a><br><sub>Server</sub></td>
    <td align="center"><a href="assets/players.png"><img src="assets/players.png" alt="Players Page"></a><br><sub>Players</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="assets/player.png"><img src="assets/player.png" alt="Player Page"></a><br><sub>Player</sub></td>
    <td align="center"><a href="assets/maps.png"><img src="assets/maps.png" alt="Maps Page"></a><br><sub>Maps</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="assets/map.png"><img src="assets/map.png" alt="Map Page"></a><br><sub>Map</sub></td>
    <td align="center"><a href="assets/live_radar.png"><img src="assets/live_radar.png" alt="Live Radar Page"></a><br><sub>Live Radar</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="assets/radar_overall.png"><img src="assets/radar_overall.png" alt="Radar Page"></a><br><sub>Radar</sub></td>
    <td align="center"><a href="assets/radar_country.png"><img src="assets/radar_country.png" alt="Radar Page2"></a><br><sub>Radar by Country</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="assets/tracker.png"><img src="assets/tracker.png" alt="Tracker Page"></a><br><sub>Tracker</sub></td>
    <td align="center"><a href="assets/3d_viewer.png"><img src="assets/3d_viewer.png" alt="3D Viewer"></a><br><sub>3D Viewer</sub></td>
  </tr>
  <tr>
    <td align="center"><a href="assets/info_sharing.png"><img src="assets/info_sharing.png" alt="Info Sharing"></a><br><sub>Info Sharing</sub></td>
    <td align="center"><a href="assets/status.png"><img src="assets/status.png" alt="Statuses"></a><br><sub>Statuses</sub></td>
  </tr>
</table>

</details>
