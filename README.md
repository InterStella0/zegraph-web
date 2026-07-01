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
  %% Frontend
  subgraph FE["🌐 Frontend"]
    direction TB
    Website("The Website")
  end
  %% Backend & GIS
  subgraph BE["🖥️ Backend Services"]
    direction TB
    Backend("Backend")
    QGIS("QGIS Server")
    ProfileProvider("Profile Picture Provider")
  end
  %% Scraper & Database
  subgraph DSDB["🗄️ Scraper & Database"]
    direction TB
    DataScraper("Data Scraper (Hidden)")
    Database[("PostgreSQL")]
  end
  %% External services
  subgraph EX["🔗 External Services"]
    direction TB
    ExternalProfileProvider("External Profile Provider")
    SteamAPI("Steam API")
    GFLAPI("GFL API")
    SteamA2s("Steam A2S")
    GFLBans("GFLBans")
    Vauff("Vauff.com")
    S2ZE("s2ze.com")
    YouTube("Youtube API v3")
    MusicNames("GitHub Music-Names")
    Nide("Nide.GG")
  end
  %% Connections with higher contrast arrows
  Website        ==> Backend
  QGIS           == WMS ==> Website
  Database       == PostGIS ==> QGIS
  Backend        ==>|Write Only| Database
  Database       ==>|Heavy Query| Backend
  Backend        ==> Website
  DataScraper    ==> Database
  Database       ==> DataScraper
  ProfileProvider ==>|Image URL| Backend
  SteamAPI       ==> ProfileProvider
  ExternalProfileProvider ==> ProfileProvider
  SteamAPI       ==>|Location| DataScraper
  GFLAPI       ==>|Match Score & Misc data| DataScraper
  MusicNames      ==>|Map Music| DataScraper
  YouTube      ==>|Map Music Video| DataScraper
  SteamA2s  ==>|Players & Map| DataScraper
  GFLBans        ==>|Players & Infraction| DataScraper
  Nide        ==>|Players & Infraction| DataScraper
  Vauff          ==>|Map Images| Backend
  S2ZE      ==>|Map Metadata| Backend
  %% GitHub-friendly styles with high contrast and rounded borders
  classDef fe fill:#e1f5fe,stroke:#0277bd,stroke-width:2px,color:#000000
  classDef be fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000000
  classDef db fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000000
  classDef ex fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
  %% Apply styling to nodes
  class Website fe
  class Backend,QGIS,ProfileProvider be
  class DataScraper,Database db
  class ExternalProfileProvider,MusicNames,YouTube,SteamAPI,SteamA2s,GFLBans,Vauff,S2ZE,GFLAPI ex
  %% Style subgraphs with rounded corners
  style FE fill:#e1f5fe,stroke:#0277bd,stroke-width:2px,color:#000000
  style BE fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000000
  style DSDB fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000000
  style EX fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000000
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