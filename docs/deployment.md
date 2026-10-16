# Static deployment

The production build is a static website. Caddy serves the files directly; the VPS
does not need Node.js, Docker, an application service, or another listening port.
The configured public address is <https://torus.classroom-fox.com>.

Private host addresses, SSH configuration, credentials, and existing server
configuration belong in the server's private operations documentation. Do not
commit them, deployment archives, or server backups to this repository.

## Build locally

Use the Node.js version required by `package.json`. The lockfile pins the dependency
tree. From a clean checkout:

```sh
npm ci
npm test
npm run build
```

Upload only the contents of `dist/`, never the checkout or `node_modules/`. All
runtime JavaScript and CSS are bundled locally. No CDN, analytics, external font,
texture download, or runtime secret is required. `base: './'` also supports a
static preview hosted under a directory.

## Server layout and releases

The suggested layout is:

```text
/srv/stanford-torus/
  releases/
    <UTC-timestamp>-<commit>/
      index.html
      assets/
  current -> releases/<UTC-timestamp>-<commit>
```

Keep release directories owned by the administrator and readable by the web
server's group. Caddy should have read access, with no ability to modify releases.
For a `root:caddy` deployment, use mode `0750` for directories and `0640` for files.
Keep the current and previous verified releases.

Archive the contents of `dist/` locally and upload the archive through your SSH
alias. Replace `SSH_ALIAS` with the alias in your private SSH configuration:

```sh
tar -czf torus-dist.tar.gz -C dist .
scp torus-dist.tar.gz SSH_ALIAS:/tmp/torus-dist.tar.gz
```

On the server, inspect the archive before extraction. Use a new release directory,
set its ownership and permissions, verify its files, and then publish with an
atomic symlink replacement. Choose a release identifier containing only letters,
digits, hyphens, and underscores; record the commit alongside the release in the
private runbook. For example, after the new release is ready:

```sh
sudo ln -s releases/RELEASE /srv/stanford-torus/.current-next
sudo mv -Tf /srv/stanford-torus/.current-next /srv/stanford-torus/current
```

The temporary symlink must not already exist. Resolve and check the new target
before publishing. Asset requests already in flight can reference the preceding
build's hashed filenames, so retain the previous release for rollback and reload
open browser tabs after an update.

## Caddy

Add a dedicated site block to the existing configuration, preserving unrelated
sites. This example assumes the group and layout above:

```caddyfile
torus.classroom-fox.com {
    root * /srv/stanford-torus/current
    encode zstd gzip

    header {
        Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        X-Frame-Options DENY
    }

    @nonAssets not path /assets/*
    header @nonAssets Cache-Control "no-cache"
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
    file_server
}
```

Validate a candidate configuration before applying it, retain a protected copy of
the original, and use a graceful reload. Existing Caddy configuration may contain
private authentication settings and must never be copied to Git:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Point the public hostname's Cloudflare DNS record at the host using the private
server inventory. DNS-only mode lets Caddy obtain and serve its TLS certificate
directly. No firewall changes or additional public ports are needed on a host
already serving HTTPS through Caddy.

## Verify and roll back

After publishing and DNS propagation, verify HTTPS, HTML revalidation, immutable
asset caching, and the security headers. Then open the site in a browser and check
that the scene renders, walking/flying works, and projectile previews appear.
Check the browser console for loading or Content Security Policy errors.

```sh
curl --fail --head https://torus.classroom-fox.com/
curl --fail https://torus.classroom-fox.com/ -o /dev/null
```

Rollback uses the same atomic symlink replacement, pointing at the retained
previous release. A content-only update or rollback needs no Caddy reload. Restore
and validate the previous Caddy configuration only when rolling back a proxy
configuration change.

The game has no server-side database or persistent user data. Rebuild assets from
the tagged commit and lockfile; preserve the private Caddy configuration and
server runbook in the host's protected configuration backups.
