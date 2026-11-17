import { afterEach, describe, expect, it } from 'vitest';
import { useGame } from '../game/store';
import { useSettings } from '../game/settings';
import type { ShownRoll } from '../game/events';
import { isDicePending, markRollRevealed, onDiceRelease } from './diceGate';

const roll = (id: number): ShownRoll => ({
  roll: 12, total: 15, dc: 13, success: true, id,
  attr: 'dexterity', attrValue: 3, bonus: 0, label: 'Sneak past the gate', logMark: 0,
} as ShownRoll);

afterEach(() => {
  useGame.setState({ shownRoll: null });
  useSettings.getState().resetSettings();
});

describe('diceGate', () => {
  it('holds the outcome from the throw until the verdict', () => {
    useSettings.getState().setSetting('reduceMotion', 'off');
    useGame.setState({ shownRoll: roll(101) });
    expect(isDicePending()).toBe(true);
    markRollRevealed(101);
    expect(isDicePending()).toBe(false);
  });

  it('holds nothing with dice off or reduced motion', () => {
    useSettings.getState().setSetting('diceFx', 'off');
    useGame.setState({ shownRoll: roll(102) });
    expect(isDicePending()).toBe(false);
    useSettings.getState().setSetting('diceFx', 'on');
    useSettings.getState().setSetting('reduceMotion', 'on');
    expect(isDicePending()).toBe(false);
  });

  it('tells listeners once when a held outcome is released', () => {
    useSettings.getState().setSetting('reduceMotion', 'off');
    let released = 0;
    const off = onDiceRelease(() => (released += 1));
    useGame.setState({ shownRoll: roll(103) });
    expect(released).toBe(0);
    markRollRevealed(103);
    useGame.setState({ shownRoll: null });
    expect(released).toBe(1);
    off();
  });
});
