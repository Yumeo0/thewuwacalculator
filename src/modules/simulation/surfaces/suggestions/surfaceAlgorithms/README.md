# Suggestions-only algorithms

This directory contains feature-local Suggestions experiments. The remaining
Random Echo worker and its tests are not mounted or imported by the production
Suggestions surface. Substat Priority has been retired from this directory.

The production Suggestions surface currently exposes Main Stats, Sonata Sets,
and Weapons through the shared suggestion engine.

Code outside Suggestions must not import from this directory. If another
system needs similar logic, implement it in that system.
