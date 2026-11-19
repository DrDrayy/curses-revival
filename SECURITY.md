# Security

## Supported versions

Only the newest release of each build (`-beta` and `-fixes`) gets security fixes.

## Reporting a problem

Please do not post details of a security problem in a public issue.

- If the **Security** tab of this repository offers **Report a vulnerability**, use it. Only the maintainers can read those reports.
- Otherwise, open an issue that only says you found a security problem, without details, and wait for a reply on how to share it privately.

Useful details: which build and version, what an attacker could do, and the steps to reproduce.

## Good to know

- curses runs a small web server on your PC (port 3030 by default) for the OBS overlay. It accepts pages from this PC and your local network only.
- The error log (`curses.log`) hides tokens and keys, but read it before you share it.
