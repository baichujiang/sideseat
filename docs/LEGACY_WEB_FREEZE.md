# Legacy Web Freeze

SideSeat's product client is the native iPhone app. The previous Next.js web
client remains in the repository as a frozen reference and regression harness;
it is not a production user surface.

## Production routing

Production middleware keeps these public surfaces available:

- `/api/**` for the native app backend
- `/.well-known/apple-app-site-association` for Universal Links
- `/share/view/**` as an iPhone app handoff fallback
- `/ios` as the general iPhone app handoff
- `/privacy` and `/support` for App Store and legal requirements

All other page routes redirect to `/ios`. Static assets required by these pages
remain available. Local development and automated web regression tests keep the
legacy UI enabled so backend and migration behavior can still be verified.

`SIDESEAT_ENABLE_LEGACY_WEB=true` is an emergency rollback switch. It should not
be set in the normal production environment.

## Link ownership

New schedule links use `https://www.sideseat.de/share/view/{token}`. The `www`
host serves AASA without a redirect and is declared in the native app's
Associated Domains entitlement. The fallback page can also open
`sideseat://share/view/{token}` when a browser has retained the link.
