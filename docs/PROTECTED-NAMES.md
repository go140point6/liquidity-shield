# Protected Names & IDs

This system prevents impersonation by automatically interning users who match
protected names or protected identities. It protects staff and allied projects
from look‑alike display names.

## What is protected

Protection uses three sources:

1. **Protected Roles**  
   Any member who has a role listed in `PROTECTED_ROLE_IDS` is protected. Their
   **username, nickname, and display name** are added to the protected set.

2. **Protected Names** (`config/protectedNames.js`)  
   A manual list of names/variants to protect (e.g., display names, usernames,
   or known impersonation patterns).

3. **Protected IDs** (`config/protectedIds.js`)  
   A manual list of trusted Discord user IDs. These users are **exempt** from
   interment even if their names match protected names.

## How matching works

Matching is currently **exact display‑name only**:

- The check uses the member’s **display name** (nickname if set, otherwise display name).
- A match requires an **exact** (case‑insensitive) string match.
- No normalization, no leetspeak mapping, and no prefix/suffix matching.

This is intentionally strict to avoid false positives.

## When it triggers

Impersonation checks run:

- **On join** (if the user arrives with a protected/impersonating name)
- **On nickname/display name change**

If a match is found and the user is not exempt, the bot:

1. Clears any timeout
2. Strips roles
3. Assigns the Penitent role (interment)
4. Logs the action to admin‑log with old → new name

## Configuration

### .env

```
PROTECTED_ROLE_IDS=roleId1,roleId2,roleId3
```

### config/protectedNames.js

Add any names or variants you want protected:

```js
const protectedNames = [
  "go140point6",
  "g0140point6",
  "DISH ♾",
  "dishxnet",
];
```

### config/protectedIds.js

Add trusted user IDs that should never be interred for name matches:

```js
const protectedIds = [
  "905444143503921192",
];
```

## Notes

- Protected roles are the safest baseline. Use protected names for extra
  coverage, and protected IDs for exemption of trusted users.
- The system is intentionally strict: if a non‑protected user matches, they are
  interred immediately.

## Future: Light Variations

If you want to catch `_name`, `.name_`, or leetspeak variants later, we can
add a **toggle** for normalized matching with careful safeguards to avoid false
positives.
