export default class HttpClient {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.timeout = 30000; // 30 seconds default
        this.authHeaders = {};
        this.staticHeaders = {};
        this.defaultOptions = {
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "same-origin",
        };
    }

    /**
     * Set request timeout
     */
    setTimeout(ms) {
        this.timeout = ms;
        return this;
    }

    /**
     * Set bearer token authentication
     * @example api.setBearerToken('eyJhbGci...')
     * // -> Authorization: Bearer eyJhbGci...
     */
    setBearerToken(token, headerName = "Authorization", prefix = "Bearer") {
        this.authHeaders = {
            ...this.authHeaders,
            [headerName]: prefix ? `${prefix} ${token}` : token,
        };
        return this;
    }

    /**
     * Set custom header authentication
     * @example api.setAuthHeader('X-HttpClient-Key', 'my-key')
     * // -> X-HttpClient-Key: my-key
     */
    setAuthHeader(headerName, value) {
        this.authHeaders = { ...this.authHeaders, [headerName]: value };
        return this;
    }

    /**
     * Set multiple authentication headers
     * @example api.setAuthHeaders({ 'Authorization': 'Bearer token', 'X-Refresh': 'refresh' })
     */
    setAuthHeaders(headers) {
        this.authHeaders = { ...this.authHeaders, ...headers };
        return this;
    }

    /**
     * Clear authentication headers
     */
    clearAuth() {
        this.authHeaders = {};
        return this;
    }

    /**
     * Set a single static header
     */
    setStaticHeader(headerName, value) {
        this.staticHeaders = { ...this.staticHeaders, [headerName]: value };
        return this;
    }

    /**
     * Set static headers (HttpClient keys, tenant IDs, etc.)
     */
    setStaticHeaders(headers) {
        this.staticHeaders = {
            ...this.staticHeaders,
            ...headers,
        };
        return this;
    }

    /**
     * Clear static headers
     */
    clearStaticHeaders() {
        this.staticHeaders = {};
        return this;
    }

    /**
     * Build complete headers
     */
    buildHeaders(customHeaders = {}, skipContentType = false) {
        const headers = {
            ...this.defaultOptions.headers,
            ...this.staticHeaders,
            ...this.authHeaders,
            ...customHeaders,
        };

        if (skipContentType) {
            delete headers["Content-Type"];
        }

        return headers;
    }

    /**
     * Build full URL
     */
    buildURL(endpoint) {
        if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
            return endpoint;
        }

        const cleanEndpoint = endpoint.startsWith("/")
            ? endpoint.slice(1)
            : endpoint;
        const cleanBaseURL = this.baseURL.endsWith("/")
            ? this.baseURL.slice(0, -1)
            : this.baseURL;

        return `${cleanBaseURL}/${cleanEndpoint}`;
    }

    /**
     * Handle response
     */
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

    /**
     * Generic request method
     */
    async request(endpoint, options = {}) {
        const url = this.buildURL(endpoint);
        const headers = this.buildHeaders(options.headers, options.skipContentType);

        const controller = new AbortController();
        const timeoutId = globalThis.setTimeout(
            () => controller.abort(),
            options.timeout ?? this.timeout,
        );

        const config = {
            ...this.defaultOptions,
            ...options,
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
            if (options._rawResponse) return response;
            return await this.handleResponse(response);
        } catch (error) {
            if (error.name === "AbortError") {
                const timeoutError = new Error(`Request timeout after ${options.timeout ?? this.timeout}ms`);
                timeoutError.name = "TimeoutError";
                timeoutError.url = url;
                console.debug("HttpClient Request Timeout:", url);
                throw timeoutError;
            }
            console.debug("HttpClient Request Error:", error);
            throw error;
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    // HTTP Methods
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
        // Pass flag to skip Content-Type (let browser set multipart boundary)
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
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        return { filename: downloadFilename, size: blob.size };
    }

    /**
     * Create a namespace-scoped client that prefixes all endpoints
     * @param {string} namespace - The namespace to prefix (e.g., 'administration')
     * @returns {HttpClient} A proxy that prefixes all requests with the namespace
     */
    namespace(namespace) {
        const parent = this;
        const prefix = namespace.startsWith('/') ? namespace : `/${namespace}`;

        const nonRoutingMethods = new Set(['constructor', 'setTimeout', 'setBearerToken', 'setAuthHeader', 'setAuthHeaders', 'clearAuth', 'setStaticHeader', 'setStaticHeaders', 'clearStaticHeaders', 'buildHeaders', 'buildURL', 'handleResponse', 'namespace']);

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
