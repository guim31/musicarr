---
trigger: always_on
---

# Agent Rules Index: Musicarr

This directory contains the source of truth for the Musicarr project.

- [**tech-stack.md**](./tech-stack.md): Versions and mandatory dependencies.
- [**architecture.md**](./architecture.md): Database schemas and service patterns.
- [**best-practices.md**](./best-practices.md): Coding standards, logs, and activity tracking.
- [**concept.md**](./concept.md): High-level vision of the music management system.

## Instructions for Agents
- Be concise. Write code, run actions, little to no explanations. No verbose output.
- Read **tech-stack.md** before suggesting any code.
- Consult **architecture.md** before adding new models or services.
- Always check **best-practices.md** for database interactions and logging.
- When creating a long-running process, ensure it updates the `activity` table.
