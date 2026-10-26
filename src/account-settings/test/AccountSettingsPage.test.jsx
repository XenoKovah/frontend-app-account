import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import { AppContext } from '@edx/frontend-platform/react';
import {
  render, screen, fireEvent, waitFor,
} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import { IntlProvider, injectIntl } from '@edx/frontend-platform/i18n';
import { mergeConfig } from '@edx/frontend-platform';

import AccountSettingsPage from '../AccountSettingsPage';
import mockData from './mockData';

const mockDispatch = jest.fn();
jest.mock('@edx/frontend-platform/analytics', () => ({
  sendTrackingLogEvent: jest.fn(),
  getCountryList: jest.fn(),
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => mockDispatch,
}));

jest.mock('@edx/frontend-platform/auth');

const IntlAccountSettingsPage = injectIntl(AccountSettingsPage);

const middlewares = [thunk];
const mockStore = configureStore(middlewares);

describe('AccountSettingsPage', () => {
  let props = {};
  let store = {};
  const appContext = { locale: 'en', authenticatedUser: { userId: 3, roles: [] } };
  const reduxWrapper = children => (
    <AppContext.Provider value={appContext}>
      <Router>
        <IntlProvider locale="en">
          <Provider store={store}>
            {children}
          </Provider>
        </IntlProvider>
      </Router>
    </AppContext.Provider>
  );

  beforeEach(() => {
    store = mockStore(mockData);
    props = {
      loaded: true,
      siteLanguage: {},
      formValues: {
        username: 'test_username',
        accomplishments_shared: false,
        name: 'test_name',
        email: 'test_email@test.com',
        id: 534,
        extended_profile: [
          {
            field_name: 'work_experience',
            field_value: '',
          },
        ],

      },
      fetchSettings: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  beforeAll(() => {
    global.lightningjs = {
      require: jest.fn().mockImplementation((module, url) => ({ moduleName: module, url })),
    };
  });

  afterAll(() => {
    delete global.lightningjs;
  });

  it('renders AccountSettingsPage correctly with editing enabled', async () => {
    const { getByText, rerender, getByLabelText } = render(reduxWrapper(<IntlAccountSettingsPage {...props} />));

    const workExperienceText = getByText('Work Experience');
    const workExperienceEditButton = workExperienceText.parentElement.querySelector('button');

    expect(workExperienceEditButton).toBeInTheDocument();

    store = mockStore({
      ...mockData,
      accountSettings: {
        ...mockData.accountSettings,
        openFormId: 'work_experience',
      },
    });
    rerender(reduxWrapper(<IntlAccountSettingsPage {...props} />));

    const submitButton = screen.getByText('Save');
    expect(submitButton).toBeInTheDocument();

    const workExperienceSelect = getByLabelText('Work Experience');

    // Use fireEvent.change to simulate changing the selected value
    fireEvent.change(workExperienceSelect, { target: { value: '4' } });

    fireEvent.click(submitButton);
  });

  it('renders the profile photo field (B1)', () => {
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    expect(screen.getByText('Profile photo')).toBeInTheDocument();
    // has_image is true in the mock, so both Upload and Remove are shown.
    expect(screen.getByText('Upload photo')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('renders the bio field (B2)', () => {
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    expect(screen.getByText('About me')).toBeInTheDocument();
  });

  it('renders the 8 social link fields (B3)', () => {
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    ['Personal website', 'LinkedIn', 'GitHub', 'GitLab', 'Mastodon', 'Bluesky', 'X', 'Discord'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    // Facebook was dropped.
    expect(screen.queryByText('Facebook')).toBeNull();
  });

  it('renders the profile visibility section with all public-field selectors (B4)', () => {
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    // "Profile visibility" appears both as the section heading and the JumpNav link.
    expect(screen.getAllByText('Profile visibility').length).toBeGreaterThan(0);
    [
      'Who can see your full name?',
      'Who can see your bio?',
      'Who can see your country?',
      'Who can see your education?',
      'Who can see your spoken language?',
      'Who can see your social links?',
      'Who can see your certificates?',
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    // The Accomplishments row is RGG-gated and hidden when RGG_STUDENT_UI_VISIBLE is off (the default).
    expect(screen.queryByText('Who can see your Accomplishments?')).toBeNull();
  });

  it('shows the Accomplishments visibility row only when RGG student UI is enabled (B4)', () => {
    mergeConfig({ RGG_STUDENT_UI_VISIBLE: true });
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    expect(screen.getByText('Who can see your Accomplishments?')).toBeInTheDocument();
    mergeConfig({ RGG_STUDENT_UI_VISIBLE: false }); // reset so it doesn't leak to other tests
  });

  it('dispatches a SAVE_SETTINGS action carrying account_privacy:custom when a visibility field is saved (B4)', () => {
    // The selects are controlled by store-derived formValues, so seed the
    // committed value the form will submit (FormData reads the rendered value).
    store = mockStore({
      ...mockData,
      accountSettings: {
        ...mockData.accountSettings,
        openFormId: 'visibility.bio',
        values: {
          ...mockData.accountSettings.values, account_privacy: 'custom', 'visibility.bio': 'private',
        },
      },
    });
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));

    fireEvent.click(screen.getByText('Save'));

    const saveAction = store.getActions().find(
      (a) => a.type === 'ACCOUNT_SETTINGS__SAVE_SETTINGS' && a.payload.formId === 'visibility.bio',
    );
    expect(saveAction).toBeDefined();
    // The changed field + account_privacy:custom go through the extendedProfile path...
    expect(saveAction.payload.commitValues).toEqual('private');
    expect(saveAction.payload.extendedProfile).toMatchObject({
      'visibility.bio': 'private',
      account_privacy: 'custom',
    });
    // ...alongside a snapshot of every other field's visibility, so switching to
    // custom doesn't silently hide the unset fields.
    expect(Object.keys(saveAction.payload.extendedProfile)).toEqual(
      expect.arrayContaining([
        'visibility.name', 'visibility.course_certificates', 'visibility.social_links',
      ]),
    );
  });

  it('dispatches a SAVE_SETTINGS action when a social link is saved with a valid URL (B3)', () => {
    store = mockStore({
      ...mockData,
      accountSettings: {
        ...mockData.accountSettings,
        openFormId: 'social_link_github',
        values: { ...mockData.accountSettings.values, social_link_github: 'https://github.com/new' },
      },
    });
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));

    fireEvent.click(screen.getByText('Save'));

    const saveAction = store.getActions().find(
      (a) => a.type === 'ACCOUNT_SETTINGS__SAVE_SETTINGS' && a.payload.formId === 'social_link_github',
    );
    expect(saveAction).toBeDefined();
    expect(saveAction.payload.commitValues).toEqual('https://github.com/new');
  });

  it('shows the Email Preferences field in Site Preferences, defaulting to "Receive all emails"', () => {
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    const label = screen.getByText('Email Preferences');
    expect(label.closest('#site-preferences')).not.toBeNull();
    expect(label.closest('#email-preferences')).not.toBeNull();
    expect(screen.getByText('Receive all emails')).toBeInTheDocument();
  });

  it('offers the three email preferences and saves the chosen one', () => {
    store = mockStore({
      ...mockData,
      accountSettings: {
        ...mockData.accountSettings,
        openFormId: 'ost2_email_preference',
        values: { ...mockData.accountSettings.values, ost2_email_preference: 'course' },
      },
    });
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));

    const select = screen.getByLabelText('Email Preferences');
    expect([...select.options].map(option => [option.value, option.text])).toEqual([
      ['all', 'Receive all emails'],
      ['course', 'Receive only emails sent to students enrolled in a course'],
      ['none', 'Receive no emails'],
    ]);
    fireEvent.click(screen.getByText('Save'));

    const saveAction = store.getActions().find(
      (a) => a.type === 'ACCOUNT_SETTINGS__SAVE_SETTINGS' && a.payload.formId === 'ost2_email_preference',
    );
    expect(saveAction).toBeDefined();
    expect(saveAction.payload.commitValues).toEqual('course');
  });

  it('dispatches a SAVE_SETTINGS_FAILURE action when a social link is saved with an invalid URL (B3)', () => {
    store = mockStore({
      ...mockData,
      accountSettings: {
        ...mockData.accountSettings,
        openFormId: 'social_link_github',
        // eslint-disable-next-line no-script-url
        values: { ...mockData.accountSettings.values, social_link_github: 'javascript:alert(1)' },
      },
    });
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));

    fireEvent.click(screen.getByText('Save'));

    // No save action; instead an inline validation failure is dispatched.
    const githubSave = store.getActions().find(
      (a) => a.type === 'ACCOUNT_SETTINGS__SAVE_SETTINGS' && a.payload.formId === 'social_link_github',
    );
    expect(githubSave).toBeUndefined();
    const failureAction = store.getActions().find((a) => a.type === 'ACCOUNT_SETTINGS__SAVE_SETTINGS__FAILURE');
    expect(failureAction).toBeDefined();
    expect(failureAction.payload.errors.social_link_github).toBeDefined();
  });

  it('opens the email editor when sent to #email (OST2 account-activation banner)', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView; // jsdom has none
    render(reduxWrapper(<IntlAccountSettingsPage {...props} />));
    expect(document.getElementById('email')).toBeInTheDocument();
    window.location.hash = '#email';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(store.getActions()).toContainEqual({ type: 'OPEN_FORM', payload: { formId: 'email' } });
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(document.getElementById('email')));
    window.location.hash = '';
    delete Element.prototype.scrollIntoView;
  });
});
