# Additional Settings Sections Slot

### Slot ID: `org.ost2.frontend.account.additional_settings_sections.v1`

## Description

OST2 fork-specific slot rendered between the "Notifications" and "Site preferences"
sections of the Account Settings page. Widgets inserted here render as their own
account-page sections (`<div className="account-section">` with an `h2.section-heading`)
and manage their own data; no plugin props are passed.

Used by tutor-contrib-rgg to insert the RGG "Gamification" preferences section
(the badge-earned pop-up toggle from `@rgg-plugins/frontend-rgg-widgets`).

## Example

```jsx
import { PLUGIN_OPERATIONS, DIRECT_PLUGIN } from '@openedx/frontend-plugin-framework';

const config = {
  pluginSlots: {
    'org.ost2.frontend.account.additional_settings_sections.v1': {
      keepDefault: true,
      plugins: [
        {
          op: PLUGIN_OPERATIONS.Insert,
          widget: {
            id: 'rgg_gamification_settings',
            type: DIRECT_PLUGIN,
            RenderWidget: BadgeNotificationsToggle,
          },
        },
      ],
    },
  },
};

export default config;
```
