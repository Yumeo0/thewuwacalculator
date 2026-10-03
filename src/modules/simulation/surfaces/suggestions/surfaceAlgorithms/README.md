# Suggestions-only algorithms

This directory contains the Substat Priority and Random Echo algorithms used
by Suggestions. They are separate from the shared suggestion engine so these
features can be changed or removed without changing engine contracts.

Code outside Suggestions must not import from this directory. If another
system needs similar logic, implement it in that system.
