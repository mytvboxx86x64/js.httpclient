export default class HttpClient {
    constructor(baseURL, options = {}) {
        this.baseURL = baseURL;
        this.options = {
            timeout:       options.timeout      ?? 30000,
            credentials:   options.credentials  ?? "same-origin",
            authHeaders:   {},
            staticHeaders: options.staticHeaders ?? {},
            onError:       null,
        };

        if (options.authHeaders) {
            this.setAuthHeaders(options.authHeaders);
        }
    }

    setTimeout(ms) {
        this.options.timeout = ms;
        return this;
    }

    /**
     * Set credentials mode for all requests
     * "same-origin" (default) — send cookies only to same origin
     * "include"               — always send cookies (required for cross-origin session/cookie auth e.g. .NET Framework Web API)
     * "omit"                  — never send cookies
     */
    setCredentials(mode) {
        this.options.credentials = mode;
        return this;
    }

    /**
     * Set the Authorization header with an optional scheme prefix
     * @example api.setAuthToken('eyJhbGci...')              // Authorization: Bearer eyJhbGci...
     * @example api.setAuthToken('abc123', 'Token')          // Authorization: Token abc123
     * @example api.setAuthToken('abc123', '')               // Authorization: abc123
     */
    setAuthToken(token, prefix = "Bearer") {
        this.options.authHeaders = {
            ...this.options.authHeaders,
            Authorization: prefix ? `${prefix} ${token}` : token,
        };
        return this;
    }

    /**
     * Set custom header authentication
     * @example api.setAuthHeader('X-API-Key', 'my-key')
     * // -> X-API-Key: my-key
     */
    setAuthHeader(headerName, value) {
        this.options.authHeaders = { ...this.options.authHeaders, [headerName]: value };
        return this;
    }

    /**
     * Set multiple authentication headers
     * @example api.setAuthHeaders({ 'Authorization': 'Bearer token', 'X-Refresh': 'refresh' })
     */
    setAuthHeaders(headers) {
        this.options.authHeaders = { ...this.options.authHeaders, ...headers };
        return this;
    }

    clearAuth() {
        this.options.authHeaders = {};
        return this;
    }

    setStaticHeader(headerName, value) {
        this.options.staticHeaders = { ...this.options.staticHeaders, [headerName]: value };
        return this;
    }

    setStaticHeaders(headers) {
        this.options.staticHeaders = { ...this.options.staticHeaders, ...headers };
        return this;
    }

    clearStaticHeaders() {
        this.options.staticHeaders = {};
        return this;
    }

    onError(callback) {
        this.options.onError = callback;
        return this;
    }

    buildHeaders(customHeaders = {}, skipContentType = false) {
        const headers = {
            "Content-Type": "application/json",
            ...this.options.staticHeaders,
            ...this.options.authHeaders,
            ...customHeaders,
        };

        if (skipContentType) {
            delete headers["Content-Type"];
        }

        return headers;
    }

    buildURL(endpoint) {
        if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
            return endpoint;
        }

        const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
        const cleanBaseURL  = this.baseURL.endsWith("/") ? this.baseURL.slice(0, -1) : this.baseURL;

        return `${cleanBaseURL}/${cleanEndpoint}`;
    }

    async handleResponse(response) {
        const contentType = response.headers.get("content-type");
        const isJSON = contentType && contentType.includes("application/json");

        const data = isJSON ? await response.json() : await response.text();

        if (!response.ok) {
            const error = new Error(
                (typeof data === 'string' ? data : data?.message) ||
                    `HTTP ${response.status}: ${response.statusText}`,
            );
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    async request(endpoint, requestOptions = {}) {
        const url     = this.buildURL(endpoint);
        const headers = this.buildHeaders(requestOptions.headers, requestOptions.skipContentType);

        const controller = new AbortController();
        const timeoutId  = globalThis.setTimeout(
            () => controller.abort(),
            requestOptions.timeout ?? this.options.timeout,
        );

        const config = {
            credentials: this.options.credentials,
            ...requestOptions,
            headers,
            signal: controller.signal,
        };

        console.debug("HttpClient Request:", { url, config });

        try {
            const response = await fetch(url, config);
            console.debug("HttpClient Response:", {
                url,
                status: response.status,
                statusText: response.statusText,
            });
            if (requestOptions._rawResponse) return response;
            return await this.handleResponse(response);
        } catch (error) {
            if (error.name === "AbortError") {
                const timeoutError = new Error(`Request timeout after ${requestOptions.timeout ?? this.options.timeout}ms`);
                timeoutError.name = "TimeoutError";
                timeoutError.url  = url;
                console.debug("HttpClient Request Timeout:", url);
                throw timeoutError;
            }
            if (this.options.onError && !requestOptions._isRetry) {
                return this.options.onError(error, () =>
                    this.request(endpoint, { ...requestOptions, _isRetry: true })
                );
            }
            console.debug("HttpClient Request Error:", error);
            throw error;
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    async get(endpoint, params = {}, options = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { ...options, method: "GET" });
    }

    async post(endpoint, data = null, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: "POST",
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async put(endpoint, data = null, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: "PUT",
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async patch(endpoint, data = null, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: "PATCH",
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async delete(endpoint, data = null, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: "DELETE",
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async upload(endpoint, formData, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: "POST",
            body: formData,
            skipContentType: true,
        });
    }

    /**
     * Download a file from the server
     * @param {string} endpoint - The endpoint to download from
     * @param {Object} params - Query parameters
     * @param {string} filename - Optional filename for the download (if not provided, extracted from Content-Disposition header)
     * @param {Object} options - Additional request options
     */
    async download(endpoint, params = {}, filename = null, options = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;

        const response = await this.request(url, {
            ...options,
            method: "GET",
            skipContentType: true,
            _rawResponse: true,
        });

        const blob = await response.blob();

        let downloadFilename = filename;
        if (!downloadFilename) {
            const contentDisposition = response.headers.get("content-disposition");
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) downloadFilename = match[1].replace(/['"]/g, '');
            }
            downloadFilename = downloadFilename || 'download';
        }

        const blobUrl = URL.createObjectURL(blob);
        const link    = document.createElement('a');
        link.href     = blobUrl;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        return { filename: downloadFilename, size: blob.size };
    }

    /**
     * Create a namespace-scoped client that prefixes all endpoints
     * @param {string} namespace - The namespace to prefix (e.g., 'users')
     * @returns {Proxy} A proxy that prefixes all HTTP method calls with the namespace
     */
    namespace(namespace) {
        const parent = this;
        const prefix = namespace.startsWith('/') ? namespace : `/${namespace}`;

        const nonRoutingMethods = new Set([
            'constructor', 'setTimeout', 'setCredentials', 'onError',
            'setAuthToken', 'setAuthHeader', 'setAuthHeaders', 'clearAuth',
            'setStaticHeader', 'setStaticHeaders', 'clearStaticHeaders',
            'buildHeaders', 'buildURL', 'handleResponse', 'namespace',
        ]);

        return new Proxy(this, {
            get(target, prop) {
                const value = target[prop];
                if (typeof value === 'function' && !nonRoutingMethods.has(prop)) {
                    return (endpoint, ...args) => {
                        const prefixedEndpoint = `${prefix}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
                        return value.call(parent, prefixedEndpoint, ...args);
                    };
                }
                return value;
            }
        });
    }
}
