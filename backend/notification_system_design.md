# Stage 1

## Notification System Design

This stage is about giving the front end a simple REST contract for showing notifications to logged-in users.

## Core actions

1. Create a notification.
2. Fetch notifications for the current user.
3. Fetch unread notifications.
4. Mark one notification as read.
5. Mark all notifications as read.
6. Push new notifications in real time.

## API format

- Base path: `/api/v1`
- Request and response format: JSON
- Auth header: `Authorization: Bearer <token>`
- Pagination fields: `page`, `limit`, `total`

## Notification schema

```json
{
  "id": "notif_12345",
  "userId": "user_1001",
  "title": "Placement Drive Update",
  "message": "New placement drive scheduled for Friday.",
  "type": "placements",
  "priority": "high",
  "isRead": false,
  "createdAt": "2026-05-02T10:00:00Z",
  "readAt": null,
  "metadata": {
    "targetUrl": "/placements/drive/42"
  }
}
```

## Endpoints

### Get all notifications

**Endpoint:** `GET /api/v1/notifications`

Returns the current user’s notifications, newest first.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "notifications": [],
    "page": 1,
    "limit": 10,
    "total": 0
  }
}
```

### Get unread notifications

**Endpoint:** `GET /api/v1/notifications/unread`

Returns only unread notifications for the current user.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "notifications": [],
    "count": 0
  }
}
```

### Mark one notification as read

**Endpoint:** `PATCH /api/v1/notifications/{notificationId}/read`

**Request Body:**

```json
{}
```

**Response 200:**

```json
{
  "success": true,
  "message": "Notification marked as read."
}
```

### Mark all notifications as read

**Endpoint:** `PATCH /api/v1/notifications/read-all`

**Request Body:**

```json
{}
```

**Response 200:**

```json
{
  "success": true,
  "message": "All notifications marked as read."
}
```

### Create a notification

**Endpoint:** `POST /api/v1/notifications`

Used by the backend to send a notification to one or more users.

**Request Body:**

```json
{
  "userIds": ["user_1001"],
  "title": "Result Published",
  "message": "Your semester results are now available.",
  "type": "results",
  "priority": "medium",
  "metadata": {
    "targetUrl": "/results/semester-6"
  }
}
```

**Response 201:**

```json
{
  "success": true,
  "message": "Notification created successfully."
}
```

## Real-time delivery

For live updates, the system should use a streaming endpoint with Server-Sent Events or WebSockets.

**Endpoint:** `GET /api/v1/notifications/stream`

**Headers:**

- `Authorization: Bearer <token>`
- `Accept: text/event-stream`

When a new notification is created, the server should push it to the right user immediately so the front end can update the badge count and notification list without refreshing.

## Error response

```json
{
  "success": false,
  "error": {
    "code": "NOTIFICATION_NOT_FOUND",
    "message": "Notification does not exist or does not belong to the user."
  }
}
```

# Stage 2

## Storage choice

For this system, I would use PostgreSQL.

I am choosing it because the notification data is structured, the queries are predictable, and we need reliable filtering for things like unread messages, user-specific fetches, and pagination. PostgreSQL also gives strong consistency, good indexing, support for JSONB for flexible metadata, and it is a better fit than storing everything in memory or in an unstructured store.

## Database schema

I would keep the data in two main tables:

### notifications

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### notification_recipients

```sql
CREATE TABLE notification_recipients (
  id UUID PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Useful indexes

```sql
CREATE INDEX idx_notification_recipients_user_read
ON notification_recipients (user_id, is_read, created_at DESC);

CREATE INDEX idx_notification_recipients_user_created
ON notification_recipients (user_id, created_at DESC);

CREATE INDEX idx_notifications_type_created
ON notifications (type, created_at DESC);
```

## How the schema matches Stage 1

- `POST /api/v1/notifications` inserts one row into `notifications` and one row per target user into `notification_recipients`.
- `GET /api/v1/notifications` reads notification rows joined with the recipient rows for the logged-in user.
- `GET /api/v1/notifications/unread` filters by `is_read = false`.
- `PATCH /api/v1/notifications/{notificationId}/read` updates one recipient row.
- `PATCH /api/v1/notifications/read-all` updates all recipient rows for that user.

## Sample queries

### 1. Create a notification

```sql
INSERT INTO notifications (id, title, message, type, priority, metadata)
VALUES (
  gen_random_uuid(),
  'Result Published',
  'Your semester results are now available.',
  'results',
  'medium',
  '{"targetUrl": "/results/semester-6"}'::jsonb
)
RETURNING id;
```

```sql
INSERT INTO notification_recipients (id, notification_id, user_id)
VALUES
  (gen_random_uuid(), :notification_id, :user_id_1),
  (gen_random_uuid(), :notification_id, :user_id_2);
```

### 2. Get all notifications for one user

```sql
SELECT
  n.id,
  n.title,
  n.message,
  n.type,
  n.priority,
  r.is_read,
  n.created_at,
  r.read_at,
  n.metadata
FROM notifications n
JOIN notification_recipients r ON r.notification_id = n.id
WHERE r.user_id = :user_id
ORDER BY n.created_at DESC
LIMIT :limit OFFSET :offset;
```

### 3. Get unread notifications

```sql
SELECT
  n.id,
  n.title,
  n.message,
  n.type,
  n.priority,
  r.created_at
FROM notifications n
JOIN notification_recipients r ON r.notification_id = n.id
WHERE r.user_id = :user_id
  AND r.is_read = FALSE
ORDER BY n.created_at DESC;
```

### 4. Mark one notification as read

```sql
UPDATE notification_recipients
SET is_read = TRUE,
    read_at = NOW()
WHERE user_id = :user_id
  AND notification_id = :notification_id;
```

### 5. Mark all notifications as read

```sql
UPDATE notification_recipients
SET is_read = TRUE,
    read_at = NOW()
WHERE user_id = :user_id
  AND is_read = FALSE;
```

### 6. Count unread notifications for the badge

```sql
SELECT COUNT(*) AS unread_count
FROM notification_recipients
WHERE user_id = :user_id
  AND is_read = FALSE;
```

## What problems can appear as data grows

As the number of notifications grows, a few issues can show up:

- Queries can slow down if indexes are missing or if tables become too large.
- The recipient table can grow very fast because one notification may belong to many users.
- Old notifications can fill up storage and make scans heavier.
- Real-time delivery can create a spike when a notification is sent to many users at once.
- Mark-all-read operations can become expensive for very active users.

## How I would handle scaling

- Add the right indexes early, especially on `user_id`, `is_read`, and `created_at`.
- Paginate every user-facing notification query.
- Partition large tables by date if the volume becomes high.
- Archive old notifications to a cold table after a fixed retention period.
- Use a queue or outbox pattern for sending notifications to many users.
- Keep real-time delivery separate from the main write path so the API stays responsive.

# Stage 3

## Is the query accurate?

Yes. The query is correct for getting unread notifications of one student:

```sql
SELECT *
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

The only issue here is `SELECT *` because it fetches more data than needed.

## Why is it slow?

It is slow because the table now has millions of rows and the database may need to scan many rows and sort the result by `createdAt`.

Without the right index, this becomes expensive.

## My changes:

I would select only the needed columns, add a composite index, and use pagination.

### Better query

```sql
SELECT id, studentID, title, message, notificationType, isRead, createdAt
FROM notifications
WHERE studentID = 1042
  AND isRead = false
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;
```

### Recommended index

```sql
CREATE INDEX idx_notifications_student_read_created
ON notifications (studentID, isRead, createdAt DESC);
```

## Approximate computing cost:

Without the index, the query is close to a table scan plus sorting, so the cost grows with table size.

With the composite index, the database can find the matching rows much faster.

## Should we add indexes on every column?

No. Adding indexes on every column is not a good solution.

Indexes help reads, but too many of them also slow down inserts, updates, and deletes and use extra storage.

So, indexes should be added only where the query pattern actually needs them.

## Query for placement notifications in the last 7 days

If `notificationType` can be `Event`, `Result`, or `Placement`, the query is:

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '7 days';
```

If the API needs the notification details too, use:

```sql
SELECT studentID, id, title, message, createdAt
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY createdAt DESC;
```

## Final answer

The query is correct, but it is slow because the table is large and the filtering plus sorting are expensive. The best fix is a composite index, not indexes on every column.

# Stage 4

## Problem

If notifications are fetched on every page load for every student, the database will keep getting hit for the same data again and again.

## Suggested solution

I would not load the full notification list every time the page refreshes. A better way is to mix caching, pagination, and real-time updates.

### 1. Cache unread notifications and badge count

Keep the unread count and recent notifications in Redis or some other fast cache.

**How it helps:** Most requests can use the cache instead of going to the database.

**Tradeoff:** The data may go slightly out of date, so it needs a short TTL or refresh logic.

### 2. Fetch only when needed

Do not load everything by default. Fetch only the first page, or load the full list only when the user opens the notification panel.

**How it helps:** It reduces unnecessary database reads and makes the page faster.

**Tradeoff:** The user may wait for one extra request when they open notifications.

### 3. Use push instead of repeated polling

Use WebSockets or Server-Sent Events so new notifications are pushed to the client.

**How it helps:** The server only sends data when there is something new.

**Tradeoff:** It is harder to manage than simple polling, especially when scaling.

### 4. Keep pagination and proper indexes

Even with caching, the database query should still use pagination and the composite index on `(studentID, isRead, createdAt)`.

**How it helps:** The fallback query will still be fast.

**Tradeoff:** Pagination adds a little extra logic, and large offsets can still slow things down.

## Best approach

The best approach is a hybrid one. Cache the unread count, fetch notifications only when needed, and push new updates in real time. That gives better performance and avoids hitting the database on every page load.

# Stage 5

## Problem with the naive approach

The naive `notify_all` that sends email, saves to DB, and pushes to app sequentially will fail at scale. It’s slow, brittle, and hard to retry. Instead, make the process asynchronous: persist the work (DB/outbox) quickly, then process sends in parallel with workers and retries.

- It’s sequential — sending 50k emails one by one takes too long.
- If some emails fail (200 failed midway), the job is partially done and hard to resume safely.
- Retries without idempotency can cause duplicates.
- External failures (email API rate limits) block the whole operation.

## What to do when 200 sends fail mid-run

- Don’t abort: record failed IDs and continue processing the rest.
- Store failures in a DLQ or a `failed_sends` table with error details.
- Retry with exponential backoff via workers; after N retries surface to ops for manual handling.
- Make sending idempotent (check recipient status or attach a send token).

## Reliable design:

1. API (HR clicks Notify All): create a `notification` and `notification_recipients` rows and write `outbox` events in one DB transaction. Return immediately.
2. Worker pool: consume outbox messages in parallel, batch email sends where possible, push in-app notifications, update recipient status, and log results.
3. Retries & DLQ: workers retry failures; items that exhaust retries go to DLQ for investigation.

Benefits: fast API response, parallel processing, controlled retries, clear audit trail.

## Minimal pseudocode

Producer:

```
function notify_all(studentIds, message) {
  notificationId = db.insert('notifications', { message, createdAt: now() })
  db.transaction(() => {
    for (id of studentIds) {
      db.insert('notification_recipients', { notificationId, userId: id, status: 'pending' })
      db.insert('outbox', { id: uuid(), type: 'send_notification', payload: { notificationId, userId: id } })
    }
  })
  return { notificationId }
}
```

Worker:

```
for each message in queue {
  if (recipient.status == 'sent') { ack(); continue }
  try {
    batchEmailSendIfPossible(message.userId, message.payload)
    pushToApp(message.userId, message.payload)
    markRecipientSent(message.userId, message.notificationId)
    ack()
  } catch (err) {
    retryOrDLQ(message, err)
    markRecipientFailed(...)
  }
}
```

## Final Thoughts:

- Batching improves throughput but needs careful error attribution.
- Outbox + worker gives durability and avoids partial state, but adds complexity.
- Make send operations idempotent to allow safe retries.



# Stage 6

## Problem statement

For this stage, the goal is to show the top 10 unread notifications in a Priority Inbox.

Priority order is:
- Placement notifications first
- Then Result notifications
- Then Event notifications

Inside the same type, latest notification should come first.

## What I implemented

I wrote a Node.js script in `backend/stage6/topPriority.js`.

The script does this:
1. Reads notifications from API response data.
2. Gives each notification a score using type weight + timestamp.
3. Sorts by score in descending order.
4. Picks the first 10 as final priority inbox.

I used these weights:
- Placement = 3
- Result = 2
- Event = 1

Score formula i used:
- `score = weight * 1e13 + timestamp`


## Files used

- `backend/stage6/topPriority.js` (code)
- `backend/stage6/sample_notifications.json` (input)
- `backend/stage6/top10_output.txt` (generated output)

## Efficient update plan for new notifications

Current assignment code re-sorts the list each run.

If notifications keep coming continuously, a better approach is to keep a min-heap of size 10:
- push new notification score
- if size > 10, remove smallest

This keeps updates fast and memory small.




