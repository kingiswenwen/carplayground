import { content } from './content';
export const releaseInfo = {
  appVersion: content.appVersion,
  appReleaseId: import.meta.env.VITE_APP_RELEASE_ID || 'local-development',
  contentReleaseId: content.id,
};
