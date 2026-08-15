import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EquipSlot, ItemDef, ItemEffect, ItemModifiers } from '../game/types';
import type { IconName } from '../icons/keys';
import { EMOJI_FALLBACK } from '../icons/keys';
import { Icon } from '../icons/Icon';
import { ICON_ASSETS } from '../icons/registry';
import { itemIcon } from '../components/Inventory/itemIcon';
import { fetchItemIcons, MAX_ICON_BYTES, MAX_ICON_EDGE, uploadItemIcon } from './lootApi';
import { findItemUsage } from './itemUsage';
import { EFFECT_KINDS, EQUIP_SLOTS } from './validateItems';

const MODIFIER_KEYS: (keyof ItemModifiers)[] = [
  'attackBonus',
  'defenseBonus',
  'dodgeBonus',
  'headTargetReduction',
  'headCritReduction',
  'weightCapacityBonus',
  'awarenessMod',
  'limbArmor',
  'statusResist',
  'accuracyBonus',
  'speedBonus',
  'travelSpeedBonus',
  'encounterChanceMod',
  'searchSpeedBonus',
];

function defaultEffect(kind: ItemEffect['kind']): ItemEffect {
  switch (kind) {
    case 'food':
      return { kind: 'food', hunger: 20 };
    case 'water':
      return { kind: 'water', thirst: 20 };
    case 'heal':
      return { kind: 'heal', health: 10 };
    case 'cure':
      return { kind: 'cure', infection: 10 };
    case 'energy':
      return { kind: 'energy', energy: 20 };
    case 'weapon':
      return { kind: 'weapon', damage: 10, accuracy: 0, ranged: false };
    case 'ammo':
      return { kind: 'ammo', rounds: 6 };
    case 'fuel':
      return { kind: 'fuel' };
    case 'misc':
      return { kind: 'misc' };
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="uppercase tracking-wider text-white/35">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-signal/50';

type Props = {
  item: ItemDef;
  /** When true, id field is locked (existing items). */
  idLocked: boolean;
  onChange: (next: ItemDef) => void;
  /** Optional status line for the parent browser chrome. */
  onStatus?: (message: string | null, error?: string | null) => void;
};

export function LootItemForm({ item, idLocked, onChange, onStatus }: Props) {
  const patch = (partial: Partial<ItemDef>) => onChange({ ...item, ...partial });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [assetKeys, setAssetKeys] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchItemIcons()
      .then((data) => {
        if (!cancelled) setAssetKeys(data.icons.map((i) => i.key));
      })
      .catch(() => {
        /* registry still works without the list */
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const knownIconKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const k of Object.keys(EMOJI_FALLBACK)) {
      if (k.startsWith('item.')) keys.add(k);
    }
    for (const k of Object.keys(ICON_ASSETS)) {
      if (k.startsWith('item.')) keys.add(k);
    }
    for (const k of assetKeys) keys.add(k);
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [assetKeys]);

  const resolvedKey = itemIcon(item);
  const ownKey = `item.${item.id}` as IconName;
  const usage = useMemo(() => findItemUsage(item.id, item), [item]);

  const setIcon = (raw: string) => {
    const v = raw.trim();
    if (!v) {
      const next = { ...item };
      delete next.icon;
      onChange(next);
    } else {
      patch({ icon: v as IconName });
    }
  };

  const handleUpload = async (file: File) => {
    if (!item.id || !/^[a-z][a-z0-9_]*$/.test(item.id)) {
      onStatus?.(null, 'Save a valid item id before uploading an icon');
      return;
    }
    setUploading(true);
    onStatus?.(null, null);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      const result = await uploadItemIcon(item.id, file);
      patch({ icon: result.key as IconName });
      setAssetKeys((prev) => (prev.includes(result.key) ? prev : [...prev, result.key].sort()));
      onStatus?.(
        `Uploaded ${result.file} (${result.bytes} bytes)${
          result.keysUpdated ? ' — registered in keys.ts' : ''
        }. Save the catalog if you changed other fields.`,
      );
    } catch (err) {
      onStatus?.(null, String(err));
    } finally {
      setUploading(false);
    }
  };

  const setEffect = (effect: ItemEffect) => patch({ effect });

  const setOptionalNumber = (key: keyof ItemDef, raw: string) => {
    if (raw.trim() === '') {
      const next = { ...item };
      delete next[key];
      onChange(next);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    patch({ [key]: n } as Partial<ItemDef>);
  };

  const setModifier = (key: keyof ItemModifiers, raw: string) => {
    const mods = { ...(item.modifiers ?? {}) };
    if (raw.trim() === '') {
      delete mods[key];
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      mods[key] = n;
    }
    const next = { ...item };
    if (Object.keys(mods).length === 0) delete next.modifiers;
    else next.modifiers = mods;
    onChange(next);
  };

  const effect = item.effect;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3">
        <Field label="id">
          <input
            className={`${inputClass} font-mono ${idLocked ? 'opacity-50' : ''}`}
            value={item.id}
            disabled={idLocked}
            onChange={(e) => patch({ id: e.target.value.trim() })}
          />
        </Field>
        <Field label="name">
          <input
            className={inputClass}
            value={item.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="color">
          <div className="flex gap-2">
            <input
              type="color"
              className="h-9 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              value={/^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : '#7f8c8d'}
              onChange={(e) => patch({ color: e.target.value })}
            />
            <input
              className={`${inputClass} flex-1 font-mono`}
              value={item.color}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </div>
        </Field>
      </section>

      <section>
        <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Icon</h4>
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded border bg-black/40 transition ${
              dragOver ? 'border-signal bg-signal/10' : 'border-white/10'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleUpload(file);
            }}
            title="Drop PNG/WebP here"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-12 w-12 object-contain" />
            ) : (
              <Icon name={resolvedKey} size={40} />
            )}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="icon key (optional override)">
              <input
                className={`${inputClass} font-mono`}
                list="loot-icon-keys"
                placeholder={ownKey}
                value={item.icon ?? ''}
                onChange={(e) => setIcon(e.target.value)}
              />
              <datalist id="loot-icon-keys">
                {knownIconKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </Field>
            <Field label="resolved">
              <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-sm text-white/60">
                {resolvedKey}
                {ICON_ASSETS[resolvedKey] ? ' · asset' : ' · emoji fallback'}
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={uploading || !item.id}
                onClick={() => fileRef.current?.click()}
                className="rounded border border-signal/40 px-2.5 py-1.5 text-xs text-signal disabled:opacity-40"
              >
                {uploading ? 'Uploading…' : 'Upload PNG / WebP'}
              </button>
              <button
                type="button"
                onClick={() => setIcon(ownKey)}
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/70"
              >
                Use item.{item.id || '…'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIcon('');
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                }}
                className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/70"
              >
                Clear override
              </button>
              <span className="text-2xs text-white/35">
                Max {Math.round(MAX_ICON_BYTES / 1024)} KB · ≤{MAX_ICON_EDGE}px edge · drop on
                preview or upload · writes{' '}
                <span className="font-mono">src/assets/icons/item-{'{id}'}.png</span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/webp,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleUpload(file);
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Grid / economy</h4>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {(
            [
              ['w', item.w],
              ['h', item.h],
              ['weight', item.weight],
              ['value', item.value],
              ['maxStack', item.maxStack],
            ] as const
          ).map(([key, val]) => (
            <Field key={key} label={key}>
              <input
                type="number"
                className={inputClass}
                value={val}
                onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<ItemDef>)}
              />
            </Field>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.stackable}
              onChange={(e) => patch({ stackable: e.target.checked })}
            />
            stackable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!item.exotic}
              onChange={(e) => {
                const next = { ...item };
                if (e.target.checked) next.exotic = true;
                else delete next.exotic;
                onChange(next);
              }}
            />
            exotic
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!item.perishable}
              onChange={(e) => {
                const next = { ...item };
                if (e.target.checked) next.perishable = true;
                else delete next.perishable;
                onChange(next);
              }}
            />
            perishable
          </label>
          <label className="flex items-center gap-2 text-sm" title="Granted when a new run starts">
            <input
              type="checkbox"
              checked={!!item.startingItem}
              onChange={(e) => {
                const next = { ...item };
                if (e.target.checked) next.startingItem = true;
                else {
                  delete next.startingItem;
                  delete next.startingCount;
                }
                onChange(next);
              }}
            />
            starting item
          </label>
          {item.startingItem && !item.slot && (
            <label className="flex items-center gap-2 text-sm">
              count
              <input
                type="number"
                min={1}
                className={`${inputClass} w-16`}
                value={item.startingCount ?? 1}
                onChange={(e) => {
                  const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                  const next = { ...item, startingItem: true as const };
                  if (n <= 1) delete next.startingCount;
                  else next.startingCount = n;
                  onChange(next);
                }}
              />
            </label>
          )}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Effect</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="kind">
            <select
              className={inputClass}
              value={effect.kind}
              onChange={(e) => setEffect(defaultEffect(e.target.value as ItemEffect['kind']))}
            >
              {[...EFFECT_KINDS].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          {effect.kind === 'food' && (
            <Field label="hunger">
              <input
                type="number"
                className={inputClass}
                value={effect.hunger}
                onChange={(e) => setEffect({ kind: 'food', hunger: Number(e.target.value) })}
              />
            </Field>
          )}
          {effect.kind === 'water' && (
            <Field label="thirst">
              <input
                type="number"
                className={inputClass}
                value={effect.thirst}
                onChange={(e) => setEffect({ kind: 'water', thirst: Number(e.target.value) })}
              />
            </Field>
          )}
          {effect.kind === 'energy' && (
            <Field label="energy">
              <input
                type="number"
                className={inputClass}
                value={effect.energy}
                onChange={(e) => setEffect({ kind: 'energy', energy: Number(e.target.value) })}
              />
            </Field>
          )}
          {effect.kind === 'cure' && (
            <Field label="infection">
              <input
                type="number"
                className={inputClass}
                value={effect.infection}
                onChange={(e) => setEffect({ kind: 'cure', infection: Number(e.target.value) })}
              />
            </Field>
          )}
          {effect.kind === 'ammo' && (
            <Field label="rounds">
              <input
                type="number"
                className={inputClass}
                value={effect.rounds}
                onChange={(e) => setEffect({ kind: 'ammo', rounds: Number(e.target.value) })}
              />
            </Field>
          )}
          {effect.kind === 'heal' && (
            <>
              <Field label="health">
                <input
                  type="number"
                  className={inputClass}
                  value={effect.health}
                  onChange={(e) =>
                    setEffect({ ...effect, kind: 'heal', health: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="partHeal">
                <input
                  type="number"
                  className={inputClass}
                  value={effect.partHeal ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const next = { ...effect, kind: 'heal' as const };
                    if (e.target.value.trim() === '') delete next.partHeal;
                    else next.partHeal = Number(e.target.value);
                    setEffect(next);
                  }}
                />
              </Field>
              <Field label="stopsBleeding">
                <select
                  className={inputClass}
                  value={effect.stopsBleeding ?? ''}
                  onChange={(e) => {
                    const next = { ...effect, kind: 'heal' as const };
                    if (!e.target.value) delete next.stopsBleeding;
                    else next.stopsBleeding = e.target.value as 'one' | 'all';
                    setEffect(next);
                  }}
                >
                  <option value="">—</option>
                  <option value="one">one</option>
                  <option value="all">all</option>
                </select>
              </Field>
              <Field label="infectionRisk">
                <input
                  type="number"
                  className={inputClass}
                  value={effect.infectionRisk ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const next = { ...effect, kind: 'heal' as const };
                    if (e.target.value.trim() === '') delete next.infectionRisk;
                    else next.infectionRisk = Number(e.target.value);
                    setEffect(next);
                  }}
                />
              </Field>
            </>
          )}
          {effect.kind === 'weapon' && (
            <>
              <Field label="damage">
                <input
                  type="number"
                  className={inputClass}
                  value={effect.damage}
                  onChange={(e) =>
                    setEffect({ ...effect, kind: 'weapon', damage: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="accuracy">
                <input
                  type="number"
                  className={inputClass}
                  value={effect.accuracy}
                  onChange={(e) =>
                    setEffect({ ...effect, kind: 'weapon', accuracy: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="roundsPerShot">
                <input
                  type="number"
                  className={inputClass}
                  value={effect.roundsPerShot ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const next = { ...effect, kind: 'weapon' as const };
                    if (e.target.value.trim() === '') delete next.roundsPerShot;
                    else next.roundsPerShot = Number(e.target.value);
                    setEffect(next);
                  }}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-1 text-sm">
                <input
                  type="checkbox"
                  checked={effect.ranged}
                  onChange={(e) =>
                    setEffect({ ...effect, kind: 'weapon', ranged: e.target.checked })
                  }
                />
                ranged
              </label>
            </>
          )}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Equip / wear</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="slot">
            <select
              className={inputClass}
              value={item.slot ?? ''}
              onChange={(e) => {
                const next = { ...item };
                if (!e.target.value) delete next.slot;
                else next.slot = e.target.value as EquipSlot;
                onChange(next);
              }}
            >
              <option value="">—</option>
              {[...EQUIP_SLOTS].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="maxCondition">
            <input
              type="number"
              className={inputClass}
              value={item.maxCondition ?? ''}
              placeholder="—"
              onChange={(e) => setOptionalNumber('maxCondition', e.target.value)}
            />
          </Field>
          <Field label="wearRate">
            <input
              type="number"
              step="0.05"
              className={inputClass}
              value={item.wearRate ?? ''}
              placeholder="—"
              onChange={(e) => setOptionalNumber('wearRate', e.target.value)}
            />
          </Field>
          <Field label="scarcity (0–1]">
            <input
              type="number"
              step="0.05"
              min={0.01}
              max={1}
              className={inputClass}
              value={item.scarcity ?? ''}
              placeholder="—"
              onChange={(e) => setOptionalNumber('scarcity', e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Modifiers</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MODIFIER_KEYS.map((key) => (
            <Field key={key} label={key}>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={item.modifiers?.[key] ?? ''}
                placeholder="—"
                onChange={(e) => setModifier(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Where used</h4>
        {usage.length === 0 ? (
          <p className="text-xs text-white/35">Not referenced by loot tables, recipes, factions, or starting gear.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs text-white/60">
            {usage.map((u) => (
              <li key={`${u.kind}:${u.label}`} className="rounded border border-white/5 bg-black/20 px-2 py-1">
                <span className="mr-2 font-mono text-2xs uppercase text-white/30">{u.kind}</span>
                {u.label}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
