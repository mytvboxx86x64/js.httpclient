# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`js.httpclient` is a lightweight, zero-dependency HTTP client library for browser environments. It is a single ES6 module (`httpclient.js`) with no build tooling, no package.json, and no compilation step — it is imported directly.

## No Build/Test/Lint Commands

There are no build, test, or lint scripts. This is a standalone browser module. Development means editing `httpclient.js` directly and testing in a browser or via a local HTML file that imports it as an ES6 module.

## Architecture

The entire library is a single default-exported `HttpClient` class in [httpclient.js](httpclient.js). It wraps the native Fetch API and is organized into these internal layers (all within the one file):

- **Configuration** — `setTimeout`, `setBearerToken`, `setAuthHeader`, `setAuthHeaders`, `setStaticHeaders`, `clearAuth`, `clearStaticHeaders`. All return `this` for chaining.
- **Header building** — `buildHeaders()` merges static, auth, and per-request custom headers. Automatically drops `Content-Type` for FormData uploads.
- **URL building** — `buildURL()` joins `baseURL` + endpoint, but treats any URL starting with `http`/`https` as absolute (bypassing baseURL).
- **Request execution** — `request()` wraps `fetch` with `AbortController`-based timeouts and emits `console.debug` logs. Throws a custom `TimeoutError` on timeout.
- **HTTP methods** — `get`, `post`, `put`, `patch`, `delete`, `upload` (FormData), `download` (Blob + auto-save).
- **Response handling** — `handleResponse()` auto-detects JSON vs text by `Content-Type`. Throws enriched error objects (`{ status, message, data }`) on non-OK responses.
- **API organization** — `namespace(prefix)` returns a Proxy that prepends a path segment to every method call. Combine with plain object endpoint definitions for full VSCode autocomplete.

## Key Design Decisions

- Uses JavaScript `Proxy` in `namespace()` to transparently prefix endpoints without subclassing.
- `createApi()` enables VSCode autocomplete on typed API structures (see `httpclient.md` for the pattern).
- Default timeout is 30 seconds; can be overridden globally or per-request via the `options.timeout` field.
- Credentials mode defaults to `same-origin`.

## Documentation

Full usage documentation is in [httpclient.md](httpclient.md), including auth patterns, timeout config, error handling, `createApi` examples, and download usage.
