# HttpClient

A flexible HTTP client with configurable authentication and request timeout support.

## Quick Start

```javascript
import HttpClient from './httpclient.js';

const httpclient = new HttpClient('https://api.example.com');
```

**Option 1 — explicit paths** (simplest, full autocomplete):

```javascript
export const endpoints = {
    auth: {
        login:   (username, password) => httpclient.post('api/auth/login', { username, password }),
        refresh: (refreshToken)       => httpclient.post('api/auth/refresh', { refreshToken }),
    },
    users: {
        getAll:  ()           => httpclient.get('api/users'),
        getById: (id)         => httpclient.get(`api/users/${id}`),
        create:  (data)       => httpclient.post('api/users', data),
        update:  (id, data)   => httpclient.put(`api/users/${id}`, data),
        delete:  (id)         => httpclient.delete(`api/users/${id}`),
    },
};
```

**Option 2 — namespace()** (less repetition for deep paths):

```javascript
const auth  = httpclient.namespace('api/auth');
const users = httpclient.namespace('api/users');

export const endpoints = {
    auth: {
        login:   (username, password) => auth.post('/login', { username, password }),
        refresh: (refreshToken)       => auth.post('/refresh', { refreshToken }),
    },
    users: {
        getAll:  ()         => users.get('/'),
        getById: (id)       => users.get(`/${id}`),
        create:  (data)     => users.post('/', data),
        update:  (id, data) => users.put(`/${id}`, data),
        delete:  (id)       => users.delete(`/${id}`),
    },
};
```

```javascript
// Usage — VSCode autocomplete works for both patterns
await endpoints.auth.login('user', 'pass');
await endpoints.users.getAll();
```

## Constructor

```javascript
new HttpClient(baseURL, options?)
```

| Option | Type | Description |
|---|---|---|
| `timeout` | number | Request timeout in ms (default: 30000) |
| `credentials` | string | Credentials mode (default: `"same-origin"`) |
| `authHeaders` | object | Sets auth headers (one or many) |
| `staticHeaders` | object | Sets static headers |

```javascript
// Minimal
const httpclient = new HttpClient('https://api.example.com');

// With options
const httpclient = new HttpClient('https://api.example.com', {
    timeout:       60000,
    credentials:   'include',
    authHeaders:   { Authorization: 'Bearer eyJhbGci...' },
    staticHeaders: { 'X-Tenant-ID': 'tenant-123' },
});
```

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

### Token (Authorization header)

```javascript
httpclient.setAuthToken('eyJhbGciOiJIUzI1NiIs...');
// -> Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

httpclient.setAuthToken('abc123', 'Token');
// -> Authorization: Token abc123

httpclient.setAuthToken('abc123', '');
// -> Authorization: abc123
```

### Custom Auth Header

Merges into existing auth headers rather than replacing them.

```javascript
httpclient.setAuthHeader('X-HttpClient-Key', 'my-api-key');
// -> X-HttpClient-Key: my-api-key

// Calling twice accumulates — does not overwrite previous keys
httpclient.setAuthHeader('X-Tenant', 'tenant-123');
// Both X-HttpClient-Key and X-Tenant are now set
```

### Multiple Auth Headers

Merges into existing auth headers rather than replacing them.

```javascript
httpclient.setAuthHeaders({
    'Authorization': 'Bearer access-token',
    'X-Refresh-Token': 'refresh-token'
});
```

### Static Headers

```javascript
// Single
httpclient.setStaticHeader('X-Tenant-ID', 'tenant-123');

// Multiple
httpclient.setStaticHeaders({
    'X-Tenant-ID': 'tenant-123',
    'X-Client-Version': '1.0.0'
});
```

### Clear Authentication

```javascript
httpclient.clearAuth();           // Remove all auth headers
httpclient.clearStaticHeaders();  // Remove all static headers
```

## Credentials

Controls whether cookies are sent with requests. Default is `"same-origin"`.

```javascript
httpclient.setCredentials('include');
// Required for cross-origin APIs that use cookie/session auth
// e.g. .NET Framework Web API with Forms Authentication or Windows Auth
```

| Mode | Behaviour |
|---|---|
| `"same-origin"` | Cookies sent only when API and app share the same origin (default) |
| `"include"` | Cookies always sent — required for cross-origin session-based APIs |
| `"omit"` | Cookies never sent |

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
    console.error(error.message);  // JSON: uses error.message field; plain-text: uses body string; fallback: "HTTP 404: Not Found"
    console.error(error.status);   // 404
    console.error(error.data);     // Parsed response body (JSON object or plain string)
}
```

## Method Chaining

Configuration methods return `this` for chaining:

```javascript
const api = new HttpClient('https://api.example.com', {
    timeout:       60000,
    bearerToken:   token,
    staticHeaders: { 'X-Tenant': 'foo' },
});
```

## Full URL Support

Endpoints starting with `http://` or `https://` bypass the base URL:

```javascript
// Uses baseURL
await httpclient.get('/users');  // -> https://api.example.com/users

// Full URL (ignores baseURL)
await httpclient.get('https://other-httpclient.com/data');  // -> https://other-httpclient.com/data
```

## Namespace

`namespace(prefix)` returns a scoped proxy that prepends a path to every HTTP call. See [Quick Start](#quick-start) Option 2 for the recommended usage pattern.

## Debug Logging

HttpClient requests are logged via `console.debug()`. When using Logger with level `DEBUG`, you'll see:

```
[DEBUG] [App] HttpClient Request: { url: "...", config: {...} }
[DEBUG] [App] HttpClient Response: { url: "...", status: 200, statusText: "OK" }
```

Set Logger level to `INFO` or higher to hide these messages.
