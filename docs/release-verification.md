# Release Verification

## Required local checks

Run these commands from a clean checkout before deploying:

```bash
npm ci
npm run build
npm run verify:netlify
```

`verify:netlify` runs the Netlify build pipeline and fails on unresolved Edge
bundle imports, failed CJS compilation, or missing Next/Netlify runtime
artifacts. The `.next` and `.netlify` directories are generated outputs and
must not be committed.

## Middleware runtime note

Next.js 16 treats `proxy.ts` as Node.js runtime middleware. Netlify's Next
runtime `5.15.13` stages that output through its `node-middleware` virtual CJS
bridge. That bridge failed to resolve the relative
`.next/server/webpack-runtime.js` dependency during local and CLI bundling.

The auth interceptor intentionally uses the supported `middleware.ts`
convention instead. This keeps the existing matcher and authorization logic,
but produces the Edge middleware bundle that Netlify can package reliably.
Next also emits an optional `@opentelemetry/api` peer import in this bundle,
so that package is declared explicitly in application dependencies.

## Netlify configuration

`netlify.toml` is the source of truth for the build command, publish directory,
and Next plugin. Netlify Git deploys should build `origin/main` with this
configuration. A deploy is release-ready only when the Netlify build is green
and the published commit matches `origin/main`.