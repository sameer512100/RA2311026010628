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


