# Liquidity Shield Admin Commands

Message commands are prefixed with `!`. All commands must be run in a server
channel where the bot can read messages.

## !resetfails

Clears a user's verification failure count and resets their verification status.

Usage:

```
!resetfails <userId|@mention>
```

Alias: `!clearfails`

Required permission: `Ban Members`

## !postrules

Posts the rules message in the configured rules channel and saves the message
ID so it can be edited later.

If a stored rules message already exists, this command is blocked unless you add
`force`.

Usage:

```
!postrules
!postrules force
```

Required permission: `Manage Server`

## !editrules

Edits the stored rules message with the current contents of
`config/rulesText.js`.

Usage:

```
!editrules
```

Required permission: `Manage Server`

## !postfaq

Posts the FAQ message in the configured FAQ channel and saves the message ID so
it can be edited later.

If a stored FAQ message already exists, this command is blocked unless you add
`force`.

Usage:

```
!postfaq
!postfaq force
```

Required permission: `Manage Server`

## !editfaq

Edits the stored FAQ message with the current contents of `config/faqText.js`.

Usage:

```
!editfaq
```

Required permission: `Manage Server`

## !ban

Bans a user and deletes up to 7 days of their messages (default). Use `save`
to ban without deleting messages.

Usage:

```
!ban <userId|@mention> [save]
```

Required permission: `Ban Members`

## !postqs

Posts the quick-start message set in the configured channel and saves message
IDs so it can be re-posted later.

If a stored quick-start post already exists, this command is blocked unless you
add `force`.

Usage:

```
!postqs
!postqs force
```

Required permission: `Manage Server`

## !editqs

Re-posts the quick-start messages using the current contents of
`config/quickStartContent.js`.

Usage:

```
!editqs
```

Required permission: `Manage Server`

## !help

Shows a list of available commands with short summaries.

Usage:

```
!help
```

## !protect

Adds or re-activates a protected Discord ID used by impersonation checks.
Shield stores the user ID, current known name, who added it, and optional
notes. It also runs an immediate sweep for non-protected members already using
that protected name and inters them.

Usage:

```
!protect <userId|@mention> [notes]
```

Required permission: `Manage Server`

## !unprotect

Marks a protected Discord ID as inactive (kept in history).

Usage:

```
!unprotect <userId|@mention> [notes]
```

Required permission: `Manage Server`

## !protected

Lists all protected IDs (active and inactive), including stored name, who added
the entry, and notes.

Usage:

```
!protected
```

Required permission: `Manage Server`

## Moderation Logs

Shield logs message edits, deletions, and bulk deletions to the admin log
channel. You can exclude channels or categories using `EXCLUDED_CHANNEL_IDS`
and `EXCLUDED_CATEGORY_IDS` in `.env`.

It also logs bans, kicks/leaves, nickname changes, and timeouts.

## !interment

Strips all roles from a user and assigns the Penitent role.

Usage:

```
!interment <userId|@mention>
```

Required permission: `Manage Roles`

## !copyroleperms

Overwrites a target role's permissions to match a source role.

Usage:

```
!copyroleperms @source @target
```

Required permission: `Manage Roles`

## !copychannelperms

Overwrites a target role's channel overwrite to match a source role's overwrite
for a specific channel. If the source role has no overwrite on that channel, the
target role's overwrite is removed.

Usage:

```
!copychannelperms #channel @source @target
```

You can also pass a category ID. The command will apply to child channels whose
source overwrite matches the category's source overwrite, and skip any channels
that are not in sync.

Required permission: `Manage Channels`

## !elevate

Sets a user's roles to only the specified role (humans only).

Usage:

```
!elevate @user @role
```

Required permission: `Manage Roles`

Alias: `!promote`

## !reassign

Sets a user's roles to only the specified role (humans only).

Usage:

```
!reassign @user @role
```

Required permission: `Manage Roles`

Alias: `!demote`
