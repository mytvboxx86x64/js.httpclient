# HttpClient

A flexible HTTP client with configurable authentication and request timeout support.

## Quick Start

```javascript
import HttpClient from './httpclient.js';

export const httpclient = new HttpClient('https://httpclient.example.com');

export const endpoints = {
    auth: {
        login: (username, password) => httpclient.post('api/auth/login', { username, password }),
        refresh: (refreshToken) => httpclient.post('api/auth/refresh', { refreshToken }),
    },
    users: {
        getAll: () => httpclient.get('api/users'),
        getById: (id) => httpclient.get(`api/users/${id}`),
        create: (data) => httpclient.post('api/users', data),
        update: (id, data) => httpclient.put(`api/users/${id}`, data),
        delete: (id) => httpclient.delete(`api/users/${id}`),
    },
};

// Usage - VSCode autocomplete works
await endpoints.auth.login('user', 'pass');
await endpoints.users.getAll();
```

## Constructor

```javascript
new HttpClient(baseURL)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseURL` | string | Base URL for all requests |

## HTTP Methods

### GET

```javascript
httpclient.get(endpoint, params?, options?)
```

```javascript
const data = await httpclient.get('/users');

// With query parameters
const filtered = await httpclient.get('/users', { status: 'active', limit: 10 });
// -> GET /users?status=active&limit=10
```

### POST

```javascript
httpclient.post(endpoint, data?, options?)
```

```javascript
const user = await httpclient.post('/users', { name: 'John', email: 'john@example.com' });
```

### PUT

```javascript
httpclient.put(endpoint, data?, options?)
```

```javascript
await httpclient.put('/users/123', { name: 'John Updated' });
```

### PATCH

```javascript
httpclient.patch(endpoint, data?, options?)
```

```javascript
await httpclient.patch('/users/123', { status: 'inactive' });
```

### DELETE

```javascript
httpclient.delete(endpoint, options?)
```

```javascript
await httpclient.delete('/users/123');
```

### Upload (FormData)

```javascript
httpclient.upload(endpoint, formData, options?)
```

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('description', 'Profile photo');

await httpclient.upload('/users/123/avatar', formData);
```

### Download (File)

```javascript
httpclient.download(endpoint, params?, filename?, options?)
```

```javascript
// Download with auto-detected filename from Content-Disposition header
await httpclient.download('/reports/monthly');

// Download with query parameters
await httpclient.download('/reports/export', { format: 'xlsx', year: 2024 });

// Download with explicit filename
await httpclient.download('/reports/export', { id: 123 }, 'report.pdf');
```

Returns `{ filename, size }` after triggering the browser download.

## Authentication

### Bearer Token

```javascript
httpclient.setBearerToken('eyJhbGciOiJIUzI1NiIs...');
// -> Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

// Custom header name and prefix
httpclient.setBearerToken('token', 'X-Auth', 'Token');
// -> X-Auth: Token token
```

### Custom Auth Header

```javascript
httpclient.setAuthHeader('X-HttpClient-Key', 'my-api-key');
// -> X-HttpClient-Key: my-api-key
```

### Multiple Auth Headers

```javascript
httpclient.setAuthHeaders({
    'Authorization': 'Bearer access-token',
    'X-Refresh-Token': 'refresh-token'
});
```

### Static Headers

```javascript
httpclient.setStaticHeaders({
    'X-Tenant-ID': 'tenant-123',
    'X-Client-Version': '1.0.0'
});
```

### Clear Authentication

```javascript
httpclient.clearAuth();           // Clear auth headers
httpclient.clearStaticHeaders();  // Clear static headers
```

## Timeout

### Global Timeout

```javascript
// Default is 30 seconds
httpclient.setTimeout(60000); // 60 seconds
```

### Per-Request Timeout

```javascript
await httpclient.get('/slow-endpoint', {}, { timeout: 120000 }); // 2 minutes
```

### Handling Timeout Errors

```javascript
try {
    await httpclient.get('/slow-endpoint');
} catch (error) {
    if (error.name === 'TimeoutError') {
        console.error('Request timed out:', error.url);
    }
}
```

## Request Options

All HTTP methods accept an `options` object:

```javascript
await httpclient.get('/users', {}, {
    timeout: 60000,              // Request-specific timeout
    credentials: 'include',      // Override credentials mode
    headers: {                   // Additional headers
        'X-Custom-Header': 'value'
    }
});
```

## Error Handling

```javascript
try {
    const user = await httpclient.get('/users/999');
} catch (error) {
    console.error(error.message);  // "HTTP 404: Not Found"
    console.error(error.status);   // 404
    console.error(error.data);     // Response body (if JSON)
}
```

## Method Chaining

Configuration methods return `this` for chaining:

```javascript
const api = new HttpClient('https://httpclient.example.com')
    .setTimeout(60000)
    .setBearerToken(token)
    .setStaticHeaders({ 'X-Tenant': 'foo' });
```

## Full URL Support

Endpoints starting with `http://` or `https://` bypass the base URL:

```javascript
// Uses baseURL
await httpclient.get('/users');  // -> https://httpclient.example.com/users

// Full URL (ignores baseURL)
await httpclient.get('https://other-httpclient.com/data');  // -> https://other-httpclient.com/data
```

## Namespaced API

Use `createApi()` to organize endpoints by namespace. Each namespace automatically gets all HTTP methods (`get`, `post`, `put`, `patch`, `delete`, `upload`) with the namespace prefixed to all requests.

```javascript
import HttpClient from './httpclient.js';

const httpClient = new HttpClient('https://api.example.com/api');

export const api = httpClient.createApi({
    administration: {
        isAlive() {
            return this.get('/IsAlive');
            // -> GET /api/administration/IsAlive
        },
    },
    users: {
        getAll() {
            return this.get('/List');
            // -> GET /api/users/List
        },
        create(data) {
            return this.post('/Create', data);
            // -> POST /api/users/Create
        },
    },
});

// Usage
await api.administration.isAlive();
await api.users.getAll();
await api.users.create({ name: 'John' });
```

### Nested Namespaces

Nested objects automatically build the full path:

```javascript
export const api = httpClient.createApi({
    config: {
        processCodeGroups: {
            getAll() {
                return this.get('/List');
                // -> GET /api/config/processCodeGroups/List
            },
            create(data) {
                return this.post('/Create', data);
                // -> POST /api/config/processCodeGroups/Create
            },
        },
        settings: {
            get() {
                return this.get('/Current');
                // -> GET /api/config/settings/Current
            },
        },
    },
});

// Usage
await api.config.processCodeGroups.getAll();
await api.config.settings.get();
```

### Direct Namespace Usage

You can also use `namespace()` standalone:

```javascript
const adminApi = httpClient.namespace('administration');

await adminApi.get('/IsAlive');    // -> /api/administration/IsAlive
await adminApi.post('/Create', {});  // -> /api/administration/Create
```

## Debug Logging

HttpClient requests are logged via `console.debug()`. When using Logger with level `DEBUG`, you'll see:

```
[DEBUG] [App] HttpClient Request: { url: "...", config: {...} }
[DEBUG] [App] HttpClient Response: { url: "...", status: 200, statusText: "OK" }
```

Set Logger level to `INFO` or higher to hide these messages.
