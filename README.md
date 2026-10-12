# ZE Graph Website
![Code Size](https://img.shields.io/github/languages/code-size/InterStella0/zegraph-web?style=flat)
![TypeScript React](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=TypeScript%20React&type=TSX)
![Rust](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=Rust&type=Rust)
![JavaScript](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=JavaScript&type=JavaScript)
![SQL](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=SQL&type=SQL)
![Total line of code](https://tokei.queeniemella.cc/b1/github/InterStella0/zegraph-web?style=flat&category=code&label=Total)

This track all CS Zombie Escape related servers that I’m aware of, allowing you to view player playtime on each server. 
It was originally created to monitor only the GFL Zombie Escape server, but has since expanded to include several 
servers in the western community. Chinese servers are not tracked due to technical limitations on their servers. Only GFL and 
Mapeadores servers provide Steam IDs, enabling consistent tracking of individual players. Other servers rely solely 
on player names for tracking. Any request for me to track your own server, you can contact me through the provided email
address on the website.

The [website](https://zegraph.xyz/) is hosted on a smol vps, be nice :)

This is codebase is purely for displaying data from the database. Itself does
not store the player data and webscraping. Those are hidden. If you wish to host your own, you would need to implement
your own datascraping mechanism.

## How it works
```mermaid
flowchart LR
  %% Scraper sources
  subgraph EXS["🔗 Scraper Sources"]
    direction TB
    SteamA2s("Steam A2S")
    GFLAPI("GFL API")
    GFLBans("GFLBans")
    Nide("Nide.GG")
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
  class ExternalProfileProvider,MusicNames,YouTube,SteamAPI,SteamA2s,GFLBans,Vauff,S2ZE,GFLAPI,Nide ex

  %% Subgraph styles
  style FE fill:#e1f5fe,stroke:#0277bd,stroke-width:2px,color:#000000
  style BE fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000000
  style DSDB fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000000
  style EXS fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
  style EXB fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
```
## Preview
![Main Page](assets/img.png)

![Server Page](assets/server.png)

![Players Page](assets/players.png)

![Player Page](assets/player.png)

![Maps Page](assets/maps.png)

![Map Page](assets/map.png)

![Live Radar Page](assets/live_radar.png)

![Radar Page](assets/radar_overall.png)

![Radar Page2](assets/radar_country.png)

![Tracker Page](assets/tracker.png)

![3D Viewer](assets/3d_viewer.png)

![Info Sharing](assets/info_sharing.png)

![Statuses](assets/status.png)
