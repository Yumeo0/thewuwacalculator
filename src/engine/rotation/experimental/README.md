# Experimental rotation replay

The experimental rotation recorder and replay engine are separate from the
production rotation evaluator. Parity tests cover them. Pages, saved rotations,
and Suggestions must not use them until a caller manages their worker lifecycle
and cache invalidation.
