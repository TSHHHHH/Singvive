import type { ActivityEventKind } from './activity';
import { dcFor, type EventCtx, type GameEvent, type StreetKind } from './events';
import { activeLocale, ev, pickEventProse } from './eventCopy';
import type { Rng } from './rng';
import type { LocationState } from './types';

/**
 * Street scenes are the noise you didn't make: a car alarm somebody wired up,
 * a gunfight a few blocks over, a shutter banging in the wind, a scavenger who
 * broke cover. They find you on arrival and play exactly like a doorway scene —
 * same card, same dice — except they end on the pavement instead of sending
 * you inside.
 *
 * The loud ones arrive with their disturbance zone already placed (the alarm is
 * ringing before you decide anything); `zoneId` lets a choice end it early.
 */
export const STREET_KIND: Record<ActivityEventKind, StreetKind> = {
  car_alarm: 'street_car_alarm',
  gunfire: 'street_gunfire',
  shutter: 'street_shutter',
  scavengers: 'street_scavenger',
};

/** Which disturbance a scene places the moment it appears, if any. */
export const STREET_ZONE: Record<ActivityEventKind, 'car_alarm' | 'gunfire' | 'shutter' | null> = {
  car_alarm: 'car_alarm',
  gunfire: 'gunfire',
  shutter: 'shutter',
  scavengers: null,
};

export function buildStreetScene(
  scene: ActivityEventKind,
  rng: Rng,
  loc: LocationState,
  ctx: EventCtx,
  zoneId: string | null,
): GameEvent {
  const kind = STREET_KIND[scene];
  const locale = activeLocale(ctx.locale);
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = pickEventProse(rng, kind, ctx, { name: loc.name });
  const line = (key: string) => ev(`${kind}.lines.${key}`, undefined, locale);
  const label = (key: string) => ev(`${kind}.choices.${key}`, undefined, locale);
  const quiet = zoneId ? [{ t: 'quiet', zoneId } as const] : [];
  const base = { kind, factionId: null, title: ev(`${kind}.title`, undefined, locale), tell, text };

  switch (scene) {
    case 'car_alarm':
      return {
        ...base,
        choices: [
          {
            id: 'disarm',
            kind: 'check',
            attr: 'dexterity',
            dc,
            label: label('disarm'),
            onSuccess: [
              ...quiet,
              { t: 'gain', defId: 'batteries' },
              { t: 'deny', line: line('disarmOk') },
            ],
            onFailure: [
              { t: 'wound', amount: 4, line: line('disarmFail') },
              { t: 'deny', line: line('disarmFailStill') },
            ],
          },
          {
            id: 'cover',
            kind: 'leave',
            label: label('cover'),
            onSuccess: [{ t: 'cover' }, { t: 'deny', line: line('cover') }],
          },
          {
            id: 'leave',
            kind: 'leave',
            label: label('leave'),
            onSuccess: [{ t: 'deny', line: line('leave') }],
          },
        ],
      };
    case 'gunfire': {
      const find = rng.pick(['ammo_9mm_box', 'scrap_metal', 'bandage', 'canned_food']);
      return {
        ...base,
        choices: [
          {
            id: 'look',
            kind: 'check',
            attr: 'perception',
            dc: dc + 1,
            label: label('look'),
            onSuccess: [
              { t: 'time', hours: 0.3, line: line('lookOk') },
              { t: 'gain', defId: find },
              { t: 'gain', defId: 'scrap_metal' },
              { t: 'deny', line: line('lookOkEnd') },
            ],
            onFailure: [
              { t: 'time', hours: 0.3, line: line('lookFail') },
              { t: 'fight', foe: 'raider' },
            ],
          },
          {
            id: 'avoid',
            kind: 'leave',
            label: label('avoid'),
            onSuccess: [{ t: 'deny', line: line('avoid') }],
          },
        ],
      };
    }
    case 'shutter':
      return {
        ...base,
        choices: [
          {
            id: 'wedge',
            kind: 'check',
            attr: 'strength',
            dc: dc - 1,
            label: label('wedge'),
            onSuccess: [
              { t: 'time', hours: 0.25, line: line('wedgeOk') },
              ...quiet,
              { t: 'deny', line: line('wedgeOkEnd') },
            ],
            onFailure: [
              { t: 'energy', amount: 5, line: line('wedgeFail') },
              { t: 'deny', line: line('wedgeFailEnd') },
            ],
          },
          {
            id: 'leave',
            kind: 'leave',
            label: label('leave'),
            onSuccess: [{ t: 'deny', line: line('leave') }],
          },
        ],
      };
    case 'scavengers': {
      const dropped = rng.pick(['canned_food', 'batteries', 'bandage', 'painkillers', 'scrap_metal']);
      return {
        ...base,
        choices: [
          {
            id: 'share',
            kind: 'pay',
            itemIds: ['water_bottle', 'newater'],
            label: label('share'),
            onSuccess: [{ t: 'scout' }, { t: 'deny', line: line('share') }],
            onFailure: [{ t: 'deny', line: line('shareNone') }],
          },
          {
            id: 'scare',
            kind: 'check',
            attr: 'strength',
            dc,
            label: label('scare'),
            onSuccess: [
              { t: 'line', line: line('scareOk') },
              { t: 'gain', defId: dropped },
              { t: 'deny', line: line('scareOkEnd') },
            ],
            onFailure: [{ t: 'line', line: line('scareFail') }, { t: 'fight', foe: 'scavenger' }],
          },
          {
            id: 'follow',
            kind: 'check',
            attr: 'perception',
            dc: dc + 1,
            label: label('follow'),
            onSuccess: [
              { t: 'time', hours: 0.5, line: line('followOk') },
              { t: 'gain', defId: 'canned_food' },
              { t: 'gain', defId: dropped },
              { t: 'deny', line: line('followOkEnd') },
            ],
            onFailure: [
              { t: 'time', hours: 0.5, line: line('followFail') },
              { t: 'deny', line: line('followFailEnd') },
            ],
          },
          {
            id: 'leave',
            kind: 'leave',
            label: label('leave'),
            onSuccess: [{ t: 'deny', line: line('leave') }],
          },
        ],
      };
    }
  }
}
