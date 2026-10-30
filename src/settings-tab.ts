/**
 * The plugin's settings tab: the deck folder, and the study settings (the same ones as the Settings panel
 * of the Plain Deck view; both write the plugin's data and every open view follows).
 */
import { PluginSettingTab, Setting, type App } from 'obsidian';
import { LIMITS, formatSteps, parseSteps, type Settings } from '@plaindeck/core';
import type PlainDeckPlugin from './main.js';

export class PlainDeckSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: PlainDeckPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = (): Settings => this.plugin.data.settings;
    const save = (patch: Partial<Settings>): void => void this.plugin.saveStudySettings({ ...settings(), ...patch });

    new Setting(containerEl)
      .setName('Deck folder')
      .setDesc('Only notes under this folder are decks. Empty: every note of the vault whose name ends in .cards.md.')
      .addText((text) => {
        text.setPlaceholder('The whole vault').setValue(this.plugin.data.folder);
        // applied when the field is left or Enter is pressed, not at every keystroke (it reads the decks again)
        text.inputEl.addEventListener('change', () => void this.plugin.setFolder(text.getValue()));
      });

    new Setting(containerEl).setName('Studying').setHeading();

    new Setting(containerEl)
      .setName('Desired retention')
      .setDesc('How likely you still know a card when it comes due. Higher means more reviews.')
      .addSlider((slider) =>
        slider
          .setLimits(70, 99, 1)
          .setValue(Math.round(settings().retention * 100))
          .onChange((value) => save({ retention: value / 100 })),
      );

    const integer = (name: string, desc: string, key: 'newPerSession' | 'maximumIntervalDays', [lo, hi]: readonly [number, number]): void => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          text.inputEl.type = 'number';
          text.inputEl.min = String(lo);
          text.inputEl.max = String(hi);
          text.setValue(String(settings()[key])).onChange((value) => {
            const n = Number(value);
            const ok = value.trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi;
            text.inputEl.toggleClass('fc-invalid', !ok);
            if (ok) save({ [key]: n });
          });
        });
    };
    integer('New cards per deck', 'How many new cards each deck adds to a study session.', 'newPerSession', LIMITS.newPerSession);
    integer('Maximum interval (days)', 'No card is scheduled further away than this.', 'maximumIntervalDays', LIMITS.maximumIntervalDays);

    const steps = (name: string, desc: string, key: 'learningSteps' | 'relearningSteps'): void => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) =>
          text.setValue(formatSteps(settings()[key])).onChange((value) => {
            const parsed = parseSteps(value);
            text.inputEl.toggleClass('fc-invalid', parsed === null);
            if (parsed !== null) save({ [key]: parsed });
          }),
        );
    };
    steps('Learning steps', 'The steps of a new card before it graduates, in m, h or d: "1m 10m".', 'learningSteps');
    steps('Relearning steps', 'The steps of a card you forgot: "10m". Empty: straight back to review.', 'relearningSteps');

    new Setting(containerEl)
      .setName('Next day starts at')
      .setDesc('Reviews due tomorrow show up from this hour on.')
      .addDropdown((dropdown) => {
        for (let h = 0; h < 24; h++) dropdown.addOption(String(h), `${String(h).padStart(2, '0')}:00`);
        dropdown.setValue(String(settings().dayStartHour)).onChange((value) => save({ dayStartHour: Number(value) }));
      });
  }
}
