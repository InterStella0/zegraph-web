# ZE Graph Frontend

Next.js web application for tracking CS2 Zombie Escape server statistics, player playtime, and community guides.

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS 4 + shadcn/ui components
- **Charts**: Chart.js with react-chartjs-2
- **Maps**: Leaflet for geographic visualizations
- **Auth**: NextAuth (Steam & Discord OAuth)
- **Package Manager**: Bun

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 20+
- Backend API running (see root README)

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
bun run build
bun run start
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Create production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run lint:fix` | Run ESLint with auto-fix |

## Project Structure

```
app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Landing page
├── admin/                  # Admin dashboard
├── live/                   # Live player tracking
├── maps/[map_name]/guides/ # Global map guides
└── servers/[server_slug]/
    ├── page.tsx            # Server dashboard
    ├── radar/              # Geographic player distribution
    ├── players/            # Player list and details
    └── maps/               # Map list, details, and guides

components/
├── maps/                   # Map-related components
├── players/                # Player-related components
├── graphs/                 # Chart components
└── ui/                     # shadcn/ui components
```

## Environment Variables

Create a `.env.local` file:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
STEAM_SECRET=
NEXTAUTH_URL=http://localhost:5173
NEXTAUTH_SECRET=
NEXT_PUBLIC_DOMAIN=localhost:5173
```