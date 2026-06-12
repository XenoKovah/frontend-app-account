import { getConfig } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';

import {
  postProfilePhoto,
  deleteProfilePhoto,
  patchAccount,
  patchSettings,
} from './service';

jest.mock('@edx/frontend-platform');
jest.mock('@edx/frontend-platform/auth');
jest.mock('@edx/frontend-platform/logging');

const username = 'test_username';
const LMS_BASE_URL = 'http://localhost:18000';

describe('account settings service', () => {
  let httpClient;

  beforeEach(() => {
    getConfig.mockReturnValue({ LMS_BASE_URL });
    httpClient = {
      get: jest.fn().mockResolvedValue({ data: {} }),
      post: jest.fn().mockResolvedValue({ data: {} }),
      patch: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({ data: {} }),
    };
    getAuthenticatedHttpClient.mockReturnValue(httpClient);
  });

  afterEach(() => jest.clearAllMocks());

  describe('postProfilePhoto', () => {
    it('POSTs multipart to the image endpoint then re-GETs the account', async () => {
      const refreshedAccount = {
        username,
        social_links: [],
        profile_image: { has_image: true, image_url_full: 'http://example.com/full.jpg' },
      };
      // First the POST resolves (204, no body); then getAccount GETs the account.
      httpClient.get.mockResolvedValueOnce({ data: refreshedAccount });

      const formData = new FormData();
      const result = await postProfilePhoto(username, formData);

      const imageUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}/image`;
      const accountUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}`;

      expect(httpClient.post).toHaveBeenCalledWith(
        imageUrl,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      expect(httpClient.get).toHaveBeenCalledWith(accountUrl);
      expect(result.profile_image).toEqual(refreshedAccount.profile_image);
    });
  });

  describe('deleteProfilePhoto', () => {
    it('DELETEs the image endpoint then re-GETs the account', async () => {
      const refreshedAccount = {
        username,
        social_links: [],
        profile_image: { has_image: false, image_url_full: 'http://example.com/default.jpg' },
      };
      httpClient.get.mockResolvedValueOnce({ data: refreshedAccount });

      const result = await deleteProfilePhoto(username);

      const imageUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}/image`;
      const accountUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}`;

      expect(httpClient.delete).toHaveBeenCalledWith(imageUrl);
      expect(httpClient.get).toHaveBeenCalledWith(accountUrl);
      expect(result.profile_image).toEqual(refreshedAccount.profile_image);
    });
  });

  describe('packAccountCommitData (via patchAccount)', () => {
    it('accumulates multiple social platforms into a single social_links array', async () => {
      httpClient.patch.mockResolvedValueOnce({ data: { username, social_links: [] } });

      await patchAccount(username, {
        social_link_blog: 'https://example.com/blog',
        social_link_github: 'https://github.com/test',
        social_link_twitter: 'https://twitter.com/test',
      });

      const accountUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}`;
      const [calledUrl, body] = httpClient.patch.mock.calls[0];
      expect(calledUrl).toEqual(accountUrl);

      // All three platforms must be present in ONE social_links array (the old
      // implementation overwrote it each loop, leaving only the last platform).
      expect(Array.isArray(body.social_links)).toBe(true);
      expect(body.social_links).toHaveLength(3);
      expect(body.social_links).toEqual(
        expect.arrayContaining([
          { platform: 'blog', social_link: 'https://example.com/blog' },
          { platform: 'github', social_link: 'https://github.com/test' },
          { platform: 'twitter', social_link: 'https://twitter.com/test' },
        ]),
      );
      // The per-platform flat keys must be stripped from the request body.
      expect(body.social_link_blog).toBeUndefined();
      expect(body.social_link_github).toBeUndefined();
      expect(body.social_link_twitter).toBeUndefined();
    });
  });

  describe('patchSettings visibility routing', () => {
    it('routes visibility.* and account_privacy to the preferences API, not the accounts API', async () => {
      // patchAccount re-unpacks its response (needs social_links); give it one.
      httpClient.patch.mockResolvedValue({ data: { username, social_links: [], bio: 'updated bio' } });

      await patchSettings(username, {
        bio: 'updated bio',
        'visibility.bio': 'private',
        account_privacy: 'custom',
      });

      const accountUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}`;
      const preferencesUrl = `${LMS_BASE_URL}/api/user/v1/preferences/${username}`;

      const accountPatch = httpClient.patch.mock.calls.find(([url]) => url === accountUrl);
      const preferencesPatch = httpClient.patch.mock.calls.find(([url]) => url === preferencesUrl);

      expect(accountPatch).toBeDefined();
      expect(preferencesPatch).toBeDefined();

      const accountBody = accountPatch[1];
      const preferencesBody = preferencesPatch[1];

      // Account-only field stays on the accounts API...
      expect(accountBody.bio).toEqual('updated bio');
      expect(accountBody['visibility.bio']).toBeUndefined();
      expect(accountBody.account_privacy).toBeUndefined();

      // ...while visibility + account_privacy go to the preferences API.
      expect(preferencesBody['visibility.bio']).toEqual('private');
      expect(preferencesBody.account_privacy).toEqual('custom');
      expect(preferencesBody.bio).toBeUndefined();
    });

    it('sends only a preferences request when every key is a visibility key', async () => {
      await patchSettings(username, {
        'visibility.social_links': 'private',
        account_privacy: 'custom',
      });

      const accountUrl = `${LMS_BASE_URL}/api/user/v1/accounts/${username}`;
      const preferencesUrl = `${LMS_BASE_URL}/api/user/v1/preferences/${username}`;

      expect(httpClient.patch.mock.calls.some(([url]) => url === accountUrl)).toBe(false);
      expect(httpClient.patch.mock.calls.some(([url]) => url === preferencesUrl)).toBe(true);
    });
  });
});
