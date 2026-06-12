import { getConfig } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';
import { logError } from '@edx/frontend-platform/logging';
import pick from 'lodash.pick';
import omit from 'lodash.omit';
import isEmpty from 'lodash.isempty';

import { handleRequestError, unpackFieldErrors } from './utils';
import { getThirdPartyAuthProviders } from '../third-party-auth';
import { postVerifiedNameConfig } from '../certificate-preference/data/service';
import { FIELD_LABELS } from './constants';

// The 8 platforms the public profile MFE renders (see frontend-app-profile
// SocialLinks.jsx / selectors.js `knownPlatforms`). The `id` strings must match
// the platform identifiers the accounts API stores. `key` is the redux/form
// field name the account MFE uses for that platform's editable text input.
const SOCIAL_PLATFORMS = [
  { id: 'blog', key: 'social_link_blog' },
  { id: 'linkedin', key: 'social_link_linkedin' },
  { id: 'github', key: 'social_link_github' },
  { id: 'gitlab', key: 'social_link_gitlab' },
  { id: 'mastodon', key: 'social_link_mastodon' },
  { id: 'bluesky', key: 'social_link_bluesky' },
  { id: 'twitter', key: 'social_link_twitter' },
  { id: 'discord', key: 'social_link_discord' },
];

// Keys that must be routed to the user-preferences API (patchPreferences)
// rather than the accounts API (patchAccount). Per-field visibility lives in
// preferences under dotted `visibility.<field>` keys, alongside account_privacy.
const isVisibilityKey = (key) => key.startsWith('visibility.') || key === 'account_privacy';

// Defense in depth: never turn a profile-supplied value into a clickable link
// unless it is clearly an http(s) URL. Ported from the profile MFE so the
// account editor validates the same way the public profile renders.
export const isSafeHttpUrl = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  // Drop the whitespace/control chars browsers ignore when resolving a scheme.
  const cleaned = Array.from(value)
    .filter((ch) => ch.charCodeAt(0) > 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .toLowerCase();
  return cleaned.startsWith('http://') || cleaned.startsWith('https://');
};

function unpackAccountResponseData(data) {
  const unpackedData = data;

  // This is handled by preferences
  delete unpackedData.time_zone;

  SOCIAL_PLATFORMS.forEach(({ id, key }) => {
    const platformData = data.social_links.find(({ platform }) => platform === id);
    unpackedData[key] = typeof platformData === 'object' ? platformData.social_link : '';
  });

  if (Array.isArray(data.language_proficiencies)) {
    if (data.language_proficiencies.length) {
      unpackedData.language_proficiencies = data.language_proficiencies[0].code;
    } else {
      unpackedData.language_proficiencies = '';
    }
  }

  return unpackedData;
}

function packAccountCommitData(commitData) {
  const packedData = commitData;

  SOCIAL_PLATFORMS.forEach(({ id, key }) => {
    // Skip missing values. Empty strings are valid values and should be preserved.
    if (commitData[key] === undefined) {
      return;
    }

    // Accumulate every supplied platform into a single social_links array.
    // (The old code reassigned packedData.social_links on each iteration, so a
    // multi-platform commit only ever sent the last platform to the API.)
    if (!Array.isArray(packedData.social_links)) {
      packedData.social_links = [];
    }
    packedData.social_links.push({ platform: id, social_link: commitData[key] });
    delete packedData[key];
  });

  if (commitData.language_proficiencies !== undefined) {
    if (commitData.language_proficiencies) {
      packedData.language_proficiencies = [{ code: commitData.language_proficiencies }];
    } else {
      // An empty string should be sent as an array.
      packedData.language_proficiencies = [];
    }
  }

  if (commitData.year_of_birth !== undefined) {
    if (commitData.year_of_birth) {
      packedData.year_of_birth = commitData.year_of_birth;
    } else {
      // An empty string should be sent as null.
      packedData.year_of_birth = null;
    }
  }
  return packedData;
}

export async function getAccount(username) {
  const { data } = await getAuthenticatedHttpClient()
    .get(`${getConfig().LMS_BASE_URL}/api/user/v1/accounts/${username}`);
  return unpackAccountResponseData(data);
}

export async function patchAccount(username, commitValues) {
  const requestConfig = {
    headers: { 'Content-Type': 'application/merge-patch+json' },
  };

  const { data } = await getAuthenticatedHttpClient()
    .patch(
      `${getConfig().LMS_BASE_URL}/api/user/v1/accounts/${username}`,
      packAccountCommitData(commitValues),
      requestConfig,
    )
    .catch((error) => {
      const unpackFunction = (fieldErrors) => {
        const unpackedFieldErrors = fieldErrors;
        if (fieldErrors.social_links) {
          SOCIAL_PLATFORMS.forEach(({ key }) => {
            unpackedFieldErrors[key] = fieldErrors.social_links;
          });
        }
        return unpackFieldErrors(unpackedFieldErrors);
      };
      handleRequestError(error, unpackFunction);
    });

  return unpackAccountResponseData(data);
}

export async function postProfilePhoto(username, formData) {
  const requestConfig = { headers: { 'Content-Type': 'multipart/form-data' } };
  const requestUrl = `${getConfig().LMS_BASE_URL}/api/user/v1/accounts/${username}/image`;

  // The image endpoint returns 204 with no body, so re-fetch the account to
  // pick up the freshly-generated profile_image URLs.
  await getAuthenticatedHttpClient()
    .post(requestUrl, formData, requestConfig)
    .catch(handleRequestError);

  return getAccount(username);
}

export async function deleteProfilePhoto(username) {
  const requestUrl = `${getConfig().LMS_BASE_URL}/api/user/v1/accounts/${username}/image`;

  // The image endpoint returns 204 with no body, so re-fetch the account to
  // pick up the reverted (default) profile_image URLs.
  await getAuthenticatedHttpClient()
    .delete(requestUrl)
    .catch(handleRequestError);

  return getAccount(username);
}

export async function getPreferences(username) {
  const { data } = await getAuthenticatedHttpClient()
    .get(`${getConfig().LMS_BASE_URL}/api/user/v1/preferences/${username}`);
  return data;
}

export async function patchPreferences(username, commitValues) {
  const requestConfig = { headers: { 'Content-Type': 'application/merge-patch+json' } };
  const requestUrl = `${getConfig().LMS_BASE_URL}/api/user/v1/preferences/${username}`;

  // Ignore the success response, the API does not currently return any data.
  await getAuthenticatedHttpClient()
    .patch(requestUrl, commitValues, requestConfig).catch(handleRequestError);

  return commitValues;
}

export async function getTimeZones(forCountry) {
  const { data } = await getAuthenticatedHttpClient()
    .get(`${getConfig().LMS_BASE_URL}/user_api/v1/preferences/time_zones/`, {
      params: { country_code: forCountry },
    })
    .catch(handleRequestError);

  return data;
}

/**
 * Determine if the user's profile data is managed by a third-party identity provider.
 */
export async function getProfileDataManager(username, userRoles) {
  const userRoleNames = userRoles.map(role => role.split(':')[0]);

  if (userRoleNames.includes('enterprise_learner')) {
    const url = `${getConfig().LMS_BASE_URL}/enterprise/api/v1/enterprise-learner/?username=${username}`;
    const { data } = await getAuthenticatedHttpClient().get(url).catch(handleRequestError);

    if (data.results.length > 0) {
      const enterprise = data.results[0] && data.results[0].enterprise_customer;
      // To ensure that enterprise returned is current enterprise & it manages profile settings
      if (enterprise && enterprise.sync_learner_profile_data) {
        return enterprise.name;
      }
    }
  }

  return null;
}

export async function getVerifiedName() {
  let data;
  const client = getAuthenticatedHttpClient();
  try {
    const requestUrl = `${getConfig().LMS_BASE_URL}/api/edx_name_affirmation/v1/verified_name`;
    ({ data } = await client.get(requestUrl));
  } catch (error) {
    return {};
  }

  return data;
}

export async function getVerifiedNameHistory() {
  let data;
  const client = getAuthenticatedHttpClient();
  try {
    const requestUrl = `${getConfig().LMS_BASE_URL}/api/edx_name_affirmation/v1/verified_name/history`;
    ({ data } = await client.get(requestUrl));
  } catch (error) {
    return {};
  }

  return data;
}

export async function postVerifiedName(data) {
  const requestConfig = { headers: { Accept: 'application/json' } };
  const requestUrl = `${getConfig().LMS_BASE_URL}/api/edx_name_affirmation/v1/verified_name`;

  await getAuthenticatedHttpClient()
    .post(requestUrl, data, requestConfig)
    .catch(error => handleRequestError(error));
}

function extractCountryList(data) {
  return data?.fields
    .find(({ name }) => name === FIELD_LABELS.COUNTRY)
    ?.options?.map(({ value }) => (value)) || [];
}

export async function getCountryList() {
  const url = `${getConfig().LMS_BASE_URL}/user_api/v1/account/registration/`;

  try {
    const { data } = await getAuthenticatedHttpClient().get(url);
    return extractCountryList(data);
  } catch (e) {
    logError(e);
    return [];
  }
}

/**
 * A single function to GET everything considered a setting. Currently encapsulates Account, Preferences, and
 * ThirdPartyAuth.
 */
export async function getSettings(username, userRoles) {
  const [
    account,
    preferences,
    thirdPartyAuthProviders,
    profileDataManager,
    timeZones,
    countries,
  ] = await Promise.all([
    getAccount(username),
    getPreferences(username),
    getThirdPartyAuthProviders(),
    getProfileDataManager(username, userRoles),
    getTimeZones(),
    getCountryList(),
  ]);

  return {
    ...account,
    ...preferences,
    thirdPartyAuthProviders,
    profileDataManager,
    timeZones,
    countries,
  };
}

/**
 * A single function to PATCH everything considered a setting.
 * Currently encapsulates Account, Preferences, ThirdPartyAuth
 */
export async function patchSettings(username, commitValues) {
  // Note: time_zone exists in the return value from user/v1/accounts
  // but it is always null and won't update. It also exists in
  // user/v1/preferences where it does update. This is the one we use.
  const preferenceKeys = ['time_zone'];
  const certificateKeys = ['useVerifiedNameForCerts'];
  // Per-field visibility (visibility.<field>) and account_privacy are stored in
  // the user-preferences API, not the accounts API. Route them dynamically so
  // any visibility.<field> key (and account_privacy) goes to patchPreferences.
  const visibilityKeys = Object.keys(commitValues).filter(isVisibilityKey);
  const accountCommitValues = omit(
    commitValues,
    preferenceKeys,
    certificateKeys,
    visibilityKeys,
  );
  const preferenceCommitValues = pick(commitValues, [...preferenceKeys, ...visibilityKeys]);
  const certCommitValues = pick(commitValues, certificateKeys);
  const patchRequests = [];

  if (!isEmpty(accountCommitValues)) {
    patchRequests.push(patchAccount(username, accountCommitValues));
  }
  if (!isEmpty(preferenceCommitValues)) {
    patchRequests.push(patchPreferences(username, preferenceCommitValues));
  }
  if (!isEmpty(certCommitValues)) {
    patchRequests.push(postVerifiedNameConfig(username, certCommitValues));
  }

  const results = await Promise.all(patchRequests);
  // Assigns in order of requests. Preference keys
  // will override account keys. Notably time_zone.
  const combinedResults = Object.assign({}, ...results);
  return combinedResults;
}
