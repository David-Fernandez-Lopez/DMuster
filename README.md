# DMuster

Web application for managing player availability across multiple tabletop RPG campaigns.

## What is DMuster?

Tabletop RPG groups often struggle to coordinate session dates across multiple campaigns and players with different schedules. DMuster replaces the typical "Google Sheets workaround" with a purpose-built tool.

Players respond to proposed session dates with one of three statuses:

- **S** — Yes, I can make it
- **N** — No, I cannot make it
- **T** — Maybe / not sure yet

The app automatically computes a **viability result** per campaign for each proposed date:

| Result | Condition |
|--------|-----------|
| Green (S) | All players confirmed |
| Red (N) | At least one player cannot attend |
| Amber (T) | At least one player is undecided or has not responded |

## Features

- Monthly calendar view with color-coded session viability per campaign
- Role-based access: **DM** manages campaigns; **Players** set their own availability
- A user can be DM of some campaigns and player in others simultaneously
- Multi-campaign support from a single account
- Mobile-first responsive design
- Available in Spanish and English (i18n)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router, fullstack) |
| Database | MySQL / MariaDB + Prisma ORM |
| Auth | Auth.js v5 (credentials provider, database sessions) |
| Styles | Tailwind CSS |
| i18n | i18next + react-i18next |
| Deployment | Docker (docker-compose) |

## Getting Started

> Prerequisites: Docker and Docker Compose installed.

```bash
git clone git@github.com:David-Fernandez-Lopez/DMuster.git
cd DMuster
cp .env.example .env   # fill in your values
docker compose up
```

The app will be available at `http://localhost:3000`.

To run database migrations and seed reference data:

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

## License

MIT
