/** The `message` event `AuthCallback` posts back to the popup opener. */
export const POPUP_MESSAGE_SOURCE = 'yourco-sdk-auth-callback';

export interface PopupMessage {
  source: typeof POPUP_MESSAGE_SOURCE;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}
