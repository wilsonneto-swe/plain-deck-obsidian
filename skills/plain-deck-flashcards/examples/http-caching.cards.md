---
tags: [web, http]
source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
---
# HTTP caching

Cards made from MDN's guide to HTTP caching. Each card asks one thing; the answer comes first, and the
reason, when there is one, after it.

## Which response header tells caches how long a response stays fresh?
`Cache-Control`, with `max-age=<seconds>`.

## What does `Cache-Control: no-cache` allow?
Storing the response, but every reuse must be revalidated with the server first.

It does not forbid storing: that is `no-store`.

## What does `Cache-Control: no-store` forbid?
Storing the response anywhere: neither the browser nor a shared cache may keep it.

## Where may a response with `Cache-Control: private` be stored?
Only in a private cache, the browser's own. Shared caches (proxies, CDNs) must not store it.

## How does a server answer a revalidation when the cached copy is still valid?
`304 Not Modified`, without a body: the client keeps using its stored copy.

## Which request header revalidates a response that came with an `ETag`?
`If-None-Match`, carrying the ETag's value.

## What does this response header allow?
```http
Cache-Control: public, max-age=31536000, immutable
```
?
Any cache, shared ones included, may keep it for a year, and the browser does not revalidate it, not even
on reload.

It suits fingerprinted files such as `app.3f9a1c.js`: a new version gets a new URL.

## Why do fingerprinted asset URLs make long caching safe?
The file's name changes whenever its content changes, so a cached copy is never stale: new content is
fetched from its new URL.
