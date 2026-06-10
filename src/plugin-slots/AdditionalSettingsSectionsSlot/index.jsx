import React from 'react';
import { PluginSlot } from '@openedx/frontend-plugin-framework';

/**
 * Renders extra, self-contained settings sections between the "Notifications"
 * and "Site preferences" sections of the Account Settings page.
 *
 * OST2 fork-specific slot (no upstream equivalent): upstream's
 * AdditionalProfileFieldsSlot is coupled to extended_profile redux state,
 * whereas widgets mounted here (e.g. the RGG gamification preferences section)
 * manage their own data and layout.
 */
const AdditionalSettingsSectionsSlot = () => (
  <PluginSlot id="org.ost2.frontend.account.additional_settings_sections.v1" />
);

export default AdditionalSettingsSectionsSlot;
