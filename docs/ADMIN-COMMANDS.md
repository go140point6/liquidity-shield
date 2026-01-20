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

Usage:

```
!postrules
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

Usage:

```
!postfaq
```

Required permission: `Manage Server`

## !editfaq

Edits the stored FAQ message with the current contents of `config/faqText.js`.

Usage:

```
!editfaq
```

Required permission: `Manage Server`

## !postqs

Posts the quick-start message set in the configured channel and saves message
IDs so it can be re-posted later.

Usage:

```
!postqs
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

## !punish

Strips all roles from a user and assigns the Penitent role.

Usage:

```
!punish <userId|@mention>
```

Alias: `!jail`

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

## !promote

Sets a user's roles to only the specified role (humans only).

Usage:

```
!promote @user @role
```

Required permission: `Manage Roles`

## !demote

Sets a user's roles to only the specified role (humans only).

Usage:

```
!demote @user @role
```

Required permission: `Manage Roles`
