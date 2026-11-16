# Wound care

Approved direction: treatment stabilizes; time heals. Keep six body parts and the existing Body panel. Wounds and care are immediately visible, without inspection steps or a separate screen. Clean medical silhouette with wounds, dressings and splints, compact injured-part rows, independent direct care actions, short feedback and reduced-motion support.

Cleaning is optional: dirty wounds still recover, at a slower rate. Bandaging never requires cleaning. Pain relief and splinting are independent. Care never grants instant limb HP or instantly cures a fracture. Food, hydration, sleep and reduced strain support recovery. Dressings occasionally soil; replacement is optional and improves recovery. Fresh injury can damage a dressing. Avoid frequent chores, new global meters, enforced treatment sequences and inspection dialogs.

Implementation scope: per-part wound state, dressing age, cleanliness, support and temporary pain relief; gradual fractures; targeted medical use with suitable automatic targets from inventory; medical services use the same stabilization rules; existing infection remains separate (do not add a new lethal wound infection system). First-aid kits provide targeted comprehensive care. Existing v7 saves gain defaults on load without a new storage key. Keep pure deterministic logic in src/game, no new dependencies. Reuse typography roles and EN/zh-Hans localization. Keep map parent subscriptions unchanged.

Catalog compatibility: plasters dress wounds; IFAK pouches provide one comprehensive treatment, larger first-aid kits have three charges. Vitamin C remains useful as non-stacking eight-hour recovery support for existing injuries (+25% gradual recovery), never instant HP. Repeating an improvised dressing without active bleeding cannot spend supplies or grant XP. Protected service beds share the wound recovery benefit of sheltered rest.

Validation: treatment order independence; dirty recovery; no instant healing; dressing aging; pain relief expiration; fractures persist after splint; legacy saves; actual store item targeting/consumption/time; full test/lint/build gates; desktop and narrow-screen rendered checks.
