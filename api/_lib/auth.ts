import { canUseThisApp, hubCookieName, isStaff, verifyHubToken, type HubUser } from './hub.js';
import { HttpError } from './http.js';

// Everyone signs in once, at the class hub. Its session cookie (shared across the class apps'
// domain) is the only source of identity: the signed-in person's hub id is the voter id, and the
// hub's instructors and TAs (isStaff) are this app's admins.

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// The signed-in person, or null (no cookie, expired or forged).
export function getHubUser(request: Request): Promise<HubUser | null> {
  return verifyHubToken(readCookie(request, hubCookieName()));
}

// A signed-in person who may use this app (guests only if their pass includes it).
export async function requireUser(request: Request): Promise<HubUser> {
  const user = await getHubUser(request);
  if (!user) throw new HttpError(401, 'Not signed in');
  if (!canUseThisApp(user)) throw new HttpError(403, 'This activity is not open to you');
  return user;
}

// The hub's instructors and TAs run polls.
export async function requireStaff(request: Request): Promise<HubUser> {
  const user = await requireUser(request);
  if (!isStaff(user)) throw new HttpError(403, 'Instructors only');
  return user;
}
