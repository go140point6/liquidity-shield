# Protected IDs and Name Protection

Shield now uses a **DB-first protected principal model**.

`config/protectedNames.js` and `config/protectedIds.js` are no longer used.

## Core model

- A protected identity is a Discord user ID in `protected_principals`.
- Each record stores:
  - `user_id`
  - `current_name` (latest known name)
  - `active` (`1` or `0`)
  - `added_by`
  - `notes`
  - timestamps
- Impersonation matching is **exact name match only** (case-insensitive).

## Commands

### `!protect`

Adds or re-activates a protected ID.
Also performs an immediate sweep for non-protected members already using that
protected name and moves matches to interment.

```
!protect <userId|@mention> [notes]
```

### `!unprotect`

Marks a protected ID as inactive (history retained).

```
!unprotect <userId|@mention> [notes]
```

### `!protected`

Lists active and inactive protected records.

```
!protected
```

## Runtime behavior

- On join, Shield checks the joining member name against active protected names.
- On nickname/display-name change, Shield checks the new name again.
- On global profile name change (`UserUpdate`), Shield also checks.
- If a non-protected user matches a protected name exactly, Shield inters them.

## Name source updates

Shield refreshes `current_name` for active protected IDs during periodic health
checks:

- Uses guild display name when available.
- Falls back to global/profile name when needed.

This keeps protected names current without manual name list maintenance.

## Protected role coverage alerts

`PROTECTED_ROLE_IDS` is now an **audit source**, not the protection source.

- If someone in a protected role is missing from the protected ID table,
  Shield logs warnings and posts admin-log alerts until fixed.

## Duplicate protected name alerts

If two active protected IDs currently have the same name:

- Shield logs warnings and posts an admin-log alert every check cycle.
- Shield DMs members in protected roles on first detection.
- Duplicate DM alerts are throttled to once every 4 hours while unresolved.

## Optional future hardening

- Add explicit alias support per protected ID (manual variants).
- Add toggleable normalized matching for targeted names only.
- Add command for forced name refresh of one protected ID.
