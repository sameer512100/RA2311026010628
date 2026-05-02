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

