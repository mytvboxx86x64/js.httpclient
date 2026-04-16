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
        this.authHeaders = { [headerName]: value };
        return this;
    }

    /**
     * Set multiple authentication headers
     * @example api.setAuthHeaders({ 'Authorization': 'Bearer token', 'X-Refresh': 'refresh' })
     */
    setAuthHeaders(headers) {
        this.authHeaders = { ...headers };
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
                data.message ||
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
        const url = this.buildURL(queryString ? `${endpoint}?${queryString}` : endpoint);
        const headers = this.buildHeaders(options.headers, true);

        const controller = new AbortController();
        const timeoutId = globalThis.setTimeout(
            () => controller.abort(),
            options.timeout ?? this.timeout,
        );

        const config = {
            ...this.defaultOptions,
            ...options,
            method: "GET",
            headers,
            signal: controller.signal,
        };

        console.debug("HttpClient Download:", { url, config });

        try {
            const response = await fetch(url, config);
            console.debug("HttpClient Download Response:", {
                url,
                status: response.status,
                statusText: response.statusText,
            });

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                throw error;
            }

            const blob = await response.blob();

            // Get filename from Content-Disposition header if not provided
            let downloadFilename = filename;
            if (!downloadFilename) {
                const contentDisposition = response.headers.get("content-disposition");
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (match) {
                        downloadFilename = match[1].replace(/['"]/g, '');
                    }
                }
                downloadFilename = downloadFilename || 'download';
            }

            // Trigger browser download
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = downloadFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);

            return { filename: downloadFilename, size: blob.size };
        } catch (error) {
            if (error.name === "AbortError") {
                const timeoutError = new Error(`Download timeout after ${options.timeout ?? this.timeout}ms`);
                timeoutError.name = "TimeoutError";
                timeoutError.url = url;
                console.debug("HttpClient Download Timeout:", url);
                throw timeoutError;
            }
            console.debug("HttpClient Download Error:", error);
            throw error;
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    /**
     * Create a namespace-scoped client that prefixes all endpoints
     * @param {string} namespace - The namespace to prefix (e.g., 'administration')
     * @returns {HttpClient} A proxy that prefixes all requests with the namespace
     */
    namespace(namespace) {
        const parent = this;
        const prefix = namespace.startsWith('/') ? namespace : `/${namespace}`;

        return new Proxy(this, {
            get(target, prop) {
                const value = target[prop];
                if (typeof value === 'function' && ['request', 'get', 'post', 'put', 'patch', 'delete', 'upload', 'download'].includes(prop)) {
                    return (endpoint, ...args) => {
                        const prefixedEndpoint = `${prefix}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
                        return value.call(parent, prefixedEndpoint, ...args);
                    };
                }
                return value;
            }
        });
    }

    /**
     * Create an API structure where each namespace automatically gets http methods
     * @param {Object} structure - Object with namespaces as keys and endpoint methods as values
     * @returns {Object} API object with namespaced methods
     * @example
     * httpClient.createApi({
     *     administration: {
     *         isAlive() { return this.get('/IsAlive'); }
     *     },
     *     config: {
     *         users: {
     *             getAll() { return this.get('/List'); } // -> /config/users/List
     *         }
     *     }
     * });
     */
    createApi(structure, parentPath = '') {
        const result = {};
        for (const [key, value] of Object.entries(structure)) {
            const currentPath = parentPath ? `${parentPath}/${key}` : key;

            // Check if value has any functions (methods)
            const hasMethods = Object.values(value).some(v => typeof v === 'function');

            if (hasMethods) {
                // This level has methods, create scoped client
                const scopedClient = this.namespace(currentPath);
                // Bind user methods to scopedClient so this.get/post/delete refer to HTTP methods
                const boundMethods = {};
                for (const [methodName, method] of Object.entries(value)) {
                    if (typeof method === 'function') {
                        boundMethods[methodName] = method.bind(scopedClient);
                    }
                }
                result[key] = { ...scopedClient, ...boundMethods };
            } else {
                // No methods at this level, recurse deeper
                result[key] = this.createApi(value, currentPath);
            }
        }
        return result;
    }
}
