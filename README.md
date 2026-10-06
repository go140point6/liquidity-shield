# Liquidity Shield

Liquidity Shield is a purpose-built moderation bot for Discord servers that need
strict access control, impersonation defense, and clear admin visibility.

<img src="img/liquidity-shield.png" alt="liquidity shield bot" width="600">

---

## What Shield does

Shield combines selected moderation behaviors into one custom workflow:

- **Verification gate** with deadline enforcement (kick on first miss, ban on second).
- **Interment system** (Penitent role) for hard isolation instead of standard timeout flow.
- **Rules reaction access** (react to gain verified access, unreact removes access).
- **Channel content publishing/editing** for rules, FAQ, and quick-start posts.
- **Protected identity controls** using protected Discord IDs and live name checks.
- **Admin action logging** for edits/deletes/bulk deletes, joins/leaves/kicks/bans, and key moderation events.
- **Evidence-aware ban flow** with cached message/attachment references for review.

---

## Command surface

Shield uses `!` prefixed admin commands for setup and moderation workflows.

<img src="img/mod-commands.png" alt="moderation commands screenshot" width="760">

### Content setup

- `!postrules`, `!editrules`
- `!postfaq`, `!editfaq`
- `!postqs`, `!editqs`

### Permission and role operations

- `!copyroleperms`
- `!copychannelperms`
- `!elevate`
- `!reassign`

### Moderation actions

- `!interment`
- `!ban`
- `!resetfails`

### Protected identity management

- `!protect`
- `!unprotect`
- `!protected`

### Utility

- `!help`

For exact syntax and permissions, see:
`docs/ADMIN-COMMANDS.md`

---

## Core systems

### Verification gate

On join, Shield starts a verification deadline. Members who verify in time are
cleared. Members who miss are escalated: first miss kicks, second miss bans.
State is stored in SQLite and processed by a restart-safe poller.

### Interment and role isolation

Interment strips normal roles and assigns only the Penitent role, keeping users
contained to designated channels until manually reassigned.

### Protected names and impersonation defense

Protected identities are ID-based (DB-backed). Shield monitors display/global
name changes and join-time matches. Non-protected users impersonating protected
names are automatically interred.

### Protection conflict monitoring

Shield checks for protected-name conflicts, alerts admins, and notifies protected
staff when conflicts appear. Repeated alerts are throttled to reduce noise.

### Managed channel content

Shield can post and update pinned operational content in designated channels,
including rules, FAQ, and quick-start guides, so setup docs stay consistent and
editable through command workflow.

### Moderation logging and evidence

Shield posts structured moderation logs to admin channels, including message
edit/delete activity and enforcement actions, so you can audit what happened and
why.

---

## License

MIT
