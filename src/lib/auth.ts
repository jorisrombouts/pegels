// Auth seam. Today a single stub user owns all data; Phase 4b (Auth.js Google) makes
// getUserId() read the real session. Everything else scopes by whatever this returns.
export const STUB_USER_ID = "user-stub";

export async function getUserId(): Promise<string> {
  return STUB_USER_ID;
}
