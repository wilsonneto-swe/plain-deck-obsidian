/**
 * The plugin's settings tab: the deck folder, and the study settings (the same ones as the Settings panel
 * of the Plain Deck view; both write the plugin's data and every open view follows).
 *
 * SETTING-DEFINITIONS: Obsidian 1.13 and later draw the tab from getSettingDefinitions(), and find its settings
 * in the settings search; each control reads and writes the plugin's data through getControlValue() and
 * setControlValue(). display() draws the same settings by hand for older versions, which never call
 * getSettingDefinitions() (and 1.13 never calls display() once there are definitions).
 */
import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import { LIMITS, formatSteps, parseSteps, type Settings } from '@plaindeck/core';
import type PlainDeckPlugin from './main.js';

type Key = 'folder' | 'retention' | 'newPerSession' | 'maximumIntervalDays' | 'learningSteps' | 'relearningSteps' | 'dayStartHour';

const TEXT = {
  folder: ['Deck folder', 'Only notes under this folder are decks. Empty: every note of the vault whose name ends in .cards.md.'],
  retention: ['Desired retention', 'How likely you still know a card when it comes due. Higher means more reviews.'],
  newPerSession: ['New cards per deck', 'How many new cards each deck adds to a study session.'],
  maximumIntervalDays: ['Maximum interval (days)', 'No card is scheduled further away than this.'],
  learningSteps: ['Learning steps', 'The steps of a new card before it graduates, in m, h or d: "1m 10m".'],
  relearningSteps: ['Relearning steps', 'The steps of a card you forgot: "10m". Empty: straight back to review.'],
  dayStartHour: ['Next day starts at', 'Reviews due tomorrow show up from this hour on.'],
} as const satisfies Record<Key, readonly [string, string]>;

const HOURS: Record<string, string> = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), `${String(h).padStart(2, '0')}:00`]));

/** A whole number in [lo, hi], or the message that says why not. */
const wholeIn =
  ([lo, hi]: readonly [number, number]) =>
  (value: number): string | undefined =>
    Number.isInteger(value) && value >= lo && value <= hi ? undefined : `A whole number from ${lo} to ${hi}.`;

const stepsMessage = (value: string): string | undefined => (parseSteps(value) === null ? 'Steps such as "1m 10m" (m, h or d).' : undefined);

/** The deck folder is applied once typing stops: each change reads the vault's decks again. */
const FOLDER_DELAY_MS = 500;

export class PlainDeckSettingTab extends PluginSettingTab {
  private folderTimer: number | null = null;

  constructor(
    app: App,
    private readonly plugin: PlainDeckPlugin,
  ) {
    super(app, plugin);
  }

  private settings(): Settings {
    return this.plugin.data.settings;
  }

  private save(patch: Partial<Settings>): Promise<void> {
    return this.plugin.saveStudySettings({ ...this.settings(), ...patch });
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { name: TEXT.folder[0], desc: TEXT.folder[1], control: { type: 'folder', key: 'folder', placeholder: 'The whole vault' } },
      {
        type: 'group',
        heading: 'Studying',
        items: [
          {
            name: TEXT.retention[0],
            desc: TEXT.retention[1],
            control: { type: 'slider', key: 'retention', min: 70, max: 99, step: 1, displayFormat: (v) => `${v}%` },
          },
          {
            name: TEXT.newPerSession[0],
            desc: TEXT.newPerSession[1],
            control: { type: 'number', key: 'newPerSession', min: LIMITS.newPerSession[0], max: LIMITS.newPerSession[1], step: 1, validate: wholeIn(LIMITS.newPerSession) },
          },
          {
            name: TEXT.maximumIntervalDays[0],
            desc: TEXT.maximumIntervalDays[1],
            control: {
              type: 'number',
              key: 'maximumIntervalDays',
              min: LIMITS.maximumIntervalDays[0],
              max: LIMITS.maximumIntervalDays[1],
              step: 1,
              validate: wholeIn(LIMITS.maximumIntervalDays),
            },
          },
          { name: TEXT.learningSteps[0], desc: TEXT.learningSteps[1], control: { type: 'text', key: 'learningSteps', placeholder: '1m 10m', validate: stepsMessage } },
          { name: TEXT.relearningSteps[0], desc: TEXT.relearningSteps[1], control: { type: 'text', key: 'relearningSteps', placeholder: '10m', validate: stepsMessage } },
          { name: TEXT.dayStartHour[0], desc: TEXT.dayStartHour[1], control: { type: 'dropdown', key: 'dayStartHour', options: HOURS } },
        ],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const s = this.settings();
    switch (key as Key) {
      case 'folder':
        return this.plugin.data.folder;
      case 'retention':
        return Math.round(s.retention * 100);
      case 'newPerSession':
        return s.newPerSession;
      case 'maximumIntervalDays':
        return s.maximumIntervalDays;
      case 'learningSteps':
        return formatSteps(s.learningSteps);
      case 'relearningSteps':
        return formatSteps(s.relearningSteps);
      case 'dayStartHour':
        return String(s.dayStartHour);
    }
    return undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const k = key as Key;
    switch (k) {
      case 'folder': {
        if (this.folderTimer !== null) window.clearTimeout(this.folderTimer);
        const folder = typeof value === 'string' ? value : '';
        this.folderTimer = window.setTimeout(() => {
          this.folderTimer = null;
          void this.plugin.setFolder(folder);
        }, FOLDER_DELAY_MS);
        return;
      }
      case 'retention':
        await this.save({ retention: Number(value) / 100 });
        return;
      case 'newPerSession':
      case 'maximumIntervalDays': {
        const n = Number(value);
        if (wholeIn(LIMITS[k])(n) === undefined) await this.save({ [k]: n });
        return;
      }
      case 'learningSteps':
      case 'relearningSteps': {
        const parsed = parseSteps(typeof value === 'string' ? value : '');
        if (parsed !== null) await this.save({ [k]: parsed });
        return;
      }
      case 'dayStartHour':
        await this.save({ dayStartHour: Number(value) });
        return;
    }
  }

  /** Obsidian older than 1.13: the same settings, drawn by hand. */
  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = (): Settings => this.settings();
    const save = (patch: Partial<Settings>): void => void this.save(patch);

    new Setting(containerEl)
      .setName(TEXT.folder[0])
      .setDesc(TEXT.folder[1])
      .addText((text) => {
        text.setPlaceholder('The whole vault').setValue(this.plugin.data.folder);
        // applied when the field is left or Enter is pressed, not at every keystroke (it reads the decks again)
        text.inputEl.addEventListener('change', () => void this.plugin.setFolder(text.getValue()));
      });

    new Setting(containerEl).setName('Studying').setHeading();

    new Setting(containerEl)
      .setName(TEXT.retention[0])
      .setDesc(TEXT.retention[1])
      .addSlider((slider) =>
        slider
          .setLimits(70, 99, 1)
          .setValue(Math.round(settings().retention * 100))
          .onChange((value) => save({ retention: value / 100 })),
      );

    const integer = (key: 'newPerSession' | 'maximumIntervalDays'): void => {
      const [lo, hi] = LIMITS[key];
      new Setting(containerEl)
        .setName(TEXT[key][0])
        .setDesc(TEXT[key][1])
        .addText((text) => {
          text.inputEl.type = 'number';
          text.inputEl.min = String(lo);
          text.inputEl.max = String(hi);
          text.setValue(String(settings()[key])).onChange((value) => {
            const n = Number(value);
            const ok = value.trim() !== '' && wholeIn(LIMITS[key])(n) === undefined;
            text.inputEl.toggleClass('fc-invalid', !ok);
            if (ok) save({ [key]: n });
          });
        });
    };
    integer('newPerSession');
    integer('maximumIntervalDays');

    const steps = (key: 'learningSteps' | 'relearningSteps'): void => {
      new Setting(containerEl)
        .setName(TEXT[key][0])
        .setDesc(TEXT[key][1])
        .addText((text) =>
          text.setValue(formatSteps(settings()[key])).onChange((value) => {
            const parsed = parseSteps(value);
            text.inputEl.toggleClass('fc-invalid', parsed === null);
            if (parsed !== null) save({ [key]: parsed });
          }),
        );
    };
    steps('learningSteps');
    steps('relearningSteps');

    new Setting(containerEl)
      .setName(TEXT.dayStartHour[0])
      .setDesc(TEXT.dayStartHour[1])
      .addDropdown((dropdown) => {
        dropdown.addOptions(HOURS);
        dropdown.setValue(String(settings().dayStartHour)).onChange((value) => save({ dayStartHour: Number(value) }));
      });
  }
}
