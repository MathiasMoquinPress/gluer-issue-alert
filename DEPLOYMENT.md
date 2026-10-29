# Device-linking repair: v5.16.1

Adding a computer previously created a new issue room, and CHANGE TABLET cleared
the existing room before pairing. A controller configured for the previous room
would stay there. In v5.16.0, the separate light service also uses per-browser
settings, which were not transferred during pairing. Light updates could be
delayed while Settings was open, or sent before the initial issue sync completed.

This update preserves the selected device's existing room, transfers its enabled
light code and relay map after PIN verification, and waits for initial sync before
publishing automatic light state. ADD DEVICE keeps the existing connection when
the dialog is opened or canceled. The connection count describes browser
connections; it is not a count of working tower controllers.

## Publish in this order

1. Merge the repair into the repository used for deployment.
2. From `sync-worker`, run `npm ci`, then `npm run deploy` using the Cloudflare
   account that owns `gluer-issue-sync`. This updates the pairing protocol. It
   does not require a new Durable Object migration.
3. Publish the updated `index.html` through the existing GitHub Pages setup.
   If merging automatically publishes Pages first, pause adding devices until
   the Worker deployment is complete. A new client connected to an old Worker
   refuses to replace an existing group and displays an update message.
4. Reload or use Update on every participating browser. Confirm **v5.16.1** on
   all of them before pairing. Old browsers do not send their current room or
   light settings, so mixed-version pairing is not a reliable repair.

## Connect the computer

1. Keep the phone that already controls the tower on its existing configuration.
   Note its Link ID and the status in **Settings → Alert light**. Do not create a
   new light code or reset the controller as a routine pairing step.
2. On that phone, open Sync and choose **ADD DEVICE**. Leave its four-digit
   pairing code visible.
3. On the computer, open Sync (then ADD DEVICE if it already has a group), select
   the phone, and enter the phone's four-digit code.
4. Both should show the same Link ID. If the phone had Alert light enabled, the
   computer should have the same light code and relay mapping.
5. When an operational test is appropriate, verify an issue from each device and
   its resolution reach the tower. A green board LED or browser connection count
   alone does not establish this.

## If the tower was already disconnected

Preserving a room prevents a future room change; it does not discover an old room
that was already lost. Restore the controller's original issue-room setting from
its firmware/configuration if it uses `/ws`. For firmware using `/light`, verify
the existing light code matches the browser's enabled setting. Do not substitute
one of these codes for the other.

The controller observed during troubleshooting exposes a `Gluer-Alert-*` Wi-Fi
setup network. Its installed firmware has not been recovered or verified against
the repository's newer `light-firmware` sketch, which uses hardcoded Wi-Fi/light
settings and has no equivalent setup portal. Do not reflash that sketch as part
of this web repair. If neither configuration can be confirmed, obtain the exact
Mac firmware project before changing the board.

## Validation

From `sync-worker`:

```sh
npm ci
npm test
npm exec -- wrangler deploy --dry-run --outdir .wrangler/dry-run
```

For the integration check, start `npm run dev -- --local --ip 127.0.0.1 --port 8787`
in one terminal, then run `node test/loopback.cjs` in another. This script has a
fixed loopback endpoint and uses synthetic codes and simulated controllers. It
does not connect to the deployed service or operate physical relays.

The regression suite covers room retention, PIN checks, light-setting transfer,
cancel/reconnect behavior, old-service rejection, URL persistence, and automatic
light updates during Settings and initial sync. Local browser inspection covers
the connection dialog. Physical hardware operation still requires validation
after deployment with the installed controller configuration.
