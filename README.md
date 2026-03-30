# Redis & Snowflake Demo

A demonstration project showcasing real-time caching with Redis and analytics data from Snowflake.

## Features

- **Redis**: Real-time metrics tracking (page views, API calls, active users)
- **Snowflake**: Sales analytics, top products, inventory data
- **Smart Caching**: Data cached in Redis with configurable TTL
- **Live Dashboard**: Auto-refreshing metrics and data visualization

## Tech Stack

- Node.js + Express
- Redis (ioredis)
- Snowflake SDK
- Vanilla HTML/JS dashboard

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```
REDIS_HOST=localhost
REDIS_PORT=6379

SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=ANALYTICS_DB
SNOWFLAKE_SCHEMA=PUBLIC
```

### 3. Run
```bash
npm start
```

Open http://localhost:3000

## Skills Demonstrated

| Technology | Use Case |
|------------|----------|
| **Redis** | Real-time metrics, caching layer, TTL management |
| **Snowflake** | Analytics queries, data aggregation, time-series data |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/metrics/realtime` | Real-time counters from Redis |
| `GET /api/metrics/sales` | Sales data from Snowflake (cached 5 min) |
| `GET /api/products/top` | Top products from Snowflake (cached 10 min) |
| `GET /api/inventory` | Inventory status (cached 3 min) |
| `POST /api/metrics/increment/:metric` | Increment a Redis counter |
| `POST /api/cache/clear` | Clear all Redis cache |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Express  │────▶│    Redis    │
│  Dashboard  │◀────│   Server   │     │   (Cache)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Snowflake  │
                    │ (Analytics) │
                    └─────────────┘
```

## Snowflake Setup (Optional)

Create these tables for real data:

```sql
CREATE TABLE SALES_DATA (
  ORDER_DATE DATE,
  REGION VARCHAR,
  REVENUE NUMBER,
  UNITS_SOLD NUMBER,
  CUSTOMER_ID NUMBER
);

CREATE TABLE PRODUCT_SALES (
  PRODUCT_NAME VARCHAR,
  CATEGORY VARCHAR,
  REGION VARCHAR,
  REVENUE NUMBER,
  UNITS_SOLD NUMBER,
  ORDER_DATE DATE
);
```

If Snowflake is not configured, the app uses mock data automatically.
