const fs = require('fs')
const path = require('path')
const axios = require('axios')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const Log = require('../logging_middleware/loggingMiddleware')

const API_URL = process.env.NOTIF_API_URL
const API_TOKEN = process.env.NOTIF_API_TOKEN || ''
const K = parseInt(process.env.TOP_K || '10', 10)

const WEIGHTS = {
  Placement: 3,
  Result: 2,
  Event: 1
}

async function safeLog(level, message) {
  try {
    await Log('backend', level, 'service', message)
  } catch (err) {
    
  }
}

function parseTimestamp(ts) {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime()
}

function scoreFor(notification) {
  const weight = WEIGHTS[notification.Type] || 0
  const ts = parseTimestamp(notification.Timestamp) || 0
  return weight * 1e13 + ts
}

async function fetchNotifications() {
  await safeLog('info', 'Starting notification fetch for Stage 6')

  const readSample = async () => {
    const samplePath = path.join(__dirname, 'sample_notifications.json')
    const raw = fs.readFileSync(samplePath, 'utf8')
    const obj = JSON.parse(raw)
    await safeLog('info', `Loaded ${obj.notifications.length} notifications from local sample file`)
    return obj.notifications
  }

  if (!API_TOKEN) {
    return readSample()
  }

  try {
    const headers = { Authorization: `Bearer ${API_TOKEN}` }
    const res = await axios.get(API_URL, { headers })
    const notifications = res.data.notifications || []
    await safeLog('info', `Loaded ${notifications.length} notifications from API`)
    return notifications
  } catch (err) {
    await safeLog('error', `API fetch failed (${err.message}), falling back to local sample`) 
    return readSample()
  }
}

async function topKNotifications(k = K) {
  const items = await fetchNotifications()
  await safeLog('info', `Computing top ${k} notifications from ${items.length} records`)

  return items
    .map((n) => ({ ...n, _score: scoreFor(n) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, k)
    .map(({ _score, ...notification }) => notification)
}

async function main() {
  try {
    await safeLog('info', 'Stage 6 topPriority script started')
    const top = await topKNotifications(K)
    const outPath = path.join(__dirname, 'top10_output.txt')
    const lines = top.map((n, i) => `${i + 1}. [${n.Type}] ${n.Message} (${n.Timestamp}) - id=${n.ID}`)
    fs.writeFileSync(outPath, lines.join('\n'))
    await safeLog('info', `Top ${top.length} notifications written to stage6/top10_output.txt`)
    console.log(lines.join('\n'))
  } catch (err) {
    await safeLog('error', `Stage 6 script failed: ${err.message}`)
    console.error('Error:', err.message)
    process.exit(1)
  }
}

if (require.main === module) main()
