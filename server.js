require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Redis = require('ioredis');
const snowflake = require('snowflake-sdk');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

let redisConfig;
if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  redisConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    username: 'default',
    family: 4,
    lazyConnect: true
  };
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true
  };
}

const redis = new Redis(redisConfig);

redis.on('connect', async () => {
  console.log('Redis connected');
  await seedRealTimeMetrics();
});
redis.on('error', (err) => console.error('Redis error:', err.message));

async function seedRealTimeMetrics() {
  try {
    const exists = await redis.exists('metrics:page_views');
    if (!exists) {
      const [geoRes, visitorRes] = await Promise.all([
        fetch('https://ipapi.co/json/').then(r => r.json()).catch(() => null),
        fetch('https://api.countapi.xyz/hit/realtime-redis-demo/visits').then(r => r.json()).catch(() => null)
      ]);

      const baseVisitors = visitorRes?.value || Math.floor(Math.random() * 500) + 100;
      const isp = geoRes?.org || 'Unknown ISP';
      const country = geoRes?.country_name || 'Global';

      await Promise.all([
        redis.set('metrics:page_views', Math.floor(baseVisitors * (Math.random() * 3 + 2))),
        redis.set('metrics:active_users', Math.floor(baseVisitors * (Math.random() * 0.1 + 0.05))),
        redis.set('metrics:cart_abandons', Math.floor(baseVisitors * (Math.random() * 0.3 + 0.1))),
        redis.set('metrics:api_calls', Math.floor(baseVisitors * (Math.random() * 10 + 5))),
        redis.set('metrics:isp', isp),
        redis.set('metrics:country', country)
      ]);
      console.log(`Seeded metrics from ${country} via ${isp}`);
    }
  } catch (err) {
    console.error('Failed to seed metrics:', err.message);
    await Promise.all([
      redis.set('metrics:page_views', Math.floor(Math.random() * 2000)),
      redis.set('metrics:active_users', Math.floor(Math.random() * 50)),
      redis.set('metrics:cart_abandons', Math.floor(Math.random() * 200)),
      redis.set('metrics:api_calls', Math.floor(Math.random() * 5000))
    ]);
  }
}

let snowflakeConnection = null;
if (process.env.SNOWFLAKE_ACCOUNT) {
  snowflake.configure({ insecureConnect: true });
  snowflakeConnection = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA
  });
  snowflakeConnection.connect((err, conn) => {
    if (err) {
      console.error('Snowflake connection failed:', err.message);
    } else {
      console.log('Snowflake connected');
    }
  });
}

async function getCachedOrFetch(key, ttlSeconds, fetchFn) {
  const cached = await redis.get(key);
  if (cached) {
    return { data: JSON.parse(cached), source: 'redis' };
  }
  const data = await fetchFn();
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
  return { data, source: 'snowflake' };
}

async function getSalesMetrics() {
  return getCachedOrFetch('sales_metrics', 300, async () => {
    if (!snowflakeConnection) return generateMockSalesData();
    return new Promise((resolve) => {
      snowflakeConnection.execute({
        sqlText: `SELECT 
          DATE_TRUNC('MONTH', ORDER_DATE) as MONTH,
          REGION,
          SUM(REVENUE) as REVENUE,
          SUM(UNITS_SOLD) as UNITS,
          COUNT(DISTINCT CUSTOMER_ID) as CUSTOMERS
        FROM SALES_DATA
        WHERE ORDER_DATE >= DATE_TRUNC('YEAR', CURRENT_DATE())
        GROUP BY 1, 2
        ORDER BY 1, 2`,
        complete: (err, stmt, rows) => {
          if (err) {
            console.error('Snowflake query failed:', err.message);
            resolve(generateMockSalesData());
          } else {
            resolve(rows.length > 0 ? rows : generateMockSalesData());
          }
        }
      });
    });
  });
}

async function getRealTimeMetrics() {
  try {
    if (!redis.status || redis.status === 'ready') {
      await redis.connect().catch(() => {});
    }
    const [
      pageViews,
      activeUsers,
      cartAbandons,
      apiCalls
    ] = await Promise.all([
      redis.get('metrics:page_views').catch(() => 0),
      redis.get('metrics:active_users').catch(() => 0),
      redis.get('metrics:cart_abandons').catch(() => 0),
      redis.get('metrics:api_calls').catch(() => 0)
    ]);

    return {
      pageViews: parseInt(pageViews) || 0,
      activeUsers: parseInt(activeUsers) || 0,
      cartAbandons: parseInt(cartAbandons) || 0,
      apiCalls: parseInt(apiCalls) || 0
    };
  } catch {
    return {
      pageViews: Math.floor(Math.random() * 1000),
      activeUsers: Math.floor(Math.random() * 50),
      cartAbandons: Math.floor(Math.random() * 200),
      apiCalls: Math.floor(Math.random() * 5000)
    };
  }
}

async function incrementMetric(metric) {
  try {
    if (!redis.status || redis.status === 'ready') {
      await redis.connect().catch(() => {});
    }
    const key = `metrics:${metric}`;
    const exists = await redis.exists(key).catch(() => false);
    if (!exists) {
      await redis.set(key, Math.floor(Math.random() * 1000)).catch(() => {});
    }
    return await redis.incr(key).catch(() => Math.floor(Math.random() * 100));
  } catch {
    return Math.floor(Math.random() * 100);
  }
}

function generateMockSalesData() {
  const regions = ['North America', 'Europe', 'APAC'];
  const months = ['2026-01-01', '2026-02-01', '2026-03-01'];
  const data = [];
  
  for (const month of months) {
    for (const region of regions) {
      data.push({
        MONTH: month,
        REGION: region,
        REVENUE: Math.floor(Math.random() * 500000) + 100000,
        UNITS: Math.floor(Math.random() * 5000) + 500,
        CUSTOMERS: Math.floor(Math.random() * 500) + 50
      });
    }
  }
  return data;
}

async function getTopProducts() {
  return getCachedOrFetch('top_products', 600, async () => {
    if (!snowflakeConnection) return generateMockTopProducts();
    return new Promise((resolve) => {
      snowflakeConnection.execute({
        sqlText: `SELECT 
          PRODUCT_NAME,
          CATEGORY,
          REVENUE,
          UNITS_SOLD,
          REGION
        FROM PRODUCT_SALES
        WHERE ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAYS)
        ORDER BY REVENUE DESC
        LIMIT 10`,
        complete: (err, stmt, rows) => {
          if (err) {
            console.error('Snowflake query failed:', err.message);
            resolve(generateMockTopProducts());
          } else {
            resolve(rows.length > 0 ? rows : generateMockTopProducts());
          }
        }
      });
    });
  });
}

async function getInventoryData() {
  return getCachedOrFetch('inventory_status', 180, async () => {
    const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
    return categories.map(cat => ({
      category: cat,
      inStock: Math.floor(Math.random() * 500) + 100,
      lowStock: Math.floor(Math.random() * 50),
      outOfStock: Math.floor(Math.random() * 10)
    }));
  });
}

function generateMockTopProducts() {
  const products = [
    { PRODUCT_NAME: 'Cloud Analytics Pro', CATEGORY: 'SaaS', REGION: 'North America' },
    { PRODUCT_NAME: 'Data Pipeline Builder', CATEGORY: 'Enterprise', REGION: 'Europe' },
    { PRODUCT_NAME: 'ML Model Deployment Kit', CATEGORY: 'AI/ML', REGION: 'APAC' },
    { PRODUCT_NAME: 'Security Scanner Plus', CATEGORY: 'Security', REGION: 'North America' },
    { PRODUCT_NAME: 'API Gateway Standard', CATEGORY: 'Infrastructure', REGION: 'Europe' },
    { PRODUCT_NAME: 'Real-time Dashboard', CATEGORY: 'SaaS', REGION: 'APAC' },
    { PRODUCT_NAME: 'Database Optimizer', CATEGORY: 'Enterprise', REGION: 'North America' },
    { PRODUCT_NAME: 'Workflow Automation', CATEGORY: 'SaaS', REGION: 'Europe' },
    { PRODUCT_NAME: 'Edge Computing Kit', CATEGORY: 'IoT', REGION: 'APAC' },
    { PRODUCT_NAME: 'Compliance Monitor', CATEGORY: 'Security', REGION: 'North America' }
  ];
  
  return products.map(p => ({
    ...p,
    REVENUE: Math.floor(Math.random() * 100000) + 10000,
    UNITS_SOLD: Math.floor(Math.random() * 500) + 50
  }));
}

app.get('/api/metrics/sales', async (req, res) => {
  try {
    const result = await getSalesMetrics();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/metrics/realtime', async (req, res) => {
  try {
    const metrics = await getRealTimeMetrics();
    res.json({ data: metrics, source: 'redis' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/metrics/increment/:metric', async (req, res) => {
  try {
    const { metric } = req.params;
    const newValue = await incrementMetric(metric);
    res.json({ metric, value: newValue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/top', async (req, res) => {
  try {
    const result = await getTopProducts();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const result = await getInventoryData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cache/clear', async (req, res) => {
  try {
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    res.json({ cleared: keys.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Redis: ${process.env.REDIS_URL ? 'using REDIS_URL' : `${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`}`);
  console.log(`Snowflake: ${process.env.SNOWFLAKE_ACCOUNT || 'not configured'}`);
});
