# Google sign-in

GroupGrub offers Google sign-in alongside email/password and guest room access.
The live website is `https://groupgrub-team.onrender.com` and the Supabase
project is `gcowxljjzmxwavhklyfu`.

## Dashboard setup

1. In [Google Cloud](https://console.cloud.google.com/auth/clients), configure
   Google Auth Platform with an External audience and basic `openid`, email,
   and profile scopes. Add your testers while the app is in Testing.
2. Create a Web application OAuth client. Add the JavaScript origin
   `https://groupgrub-team.onrender.com` and the redirect URI:

   ```text
   https://gcowxljjzmxwavhklyfu.supabase.co/auth/v1/callback
   ```

3. In Supabase Authentication -> Sign In / Providers -> Google, enable Google
   and save the client ID and client secret. Keep the secret private.
4. Under Authentication -> URL Configuration, set the Site URL to
   `https://groupgrub-team.onrender.com` and add
   `https://groupgrub-team.onrender.com/account` to Redirect URLs.
5. Publish/deploy the app changes, then test Continue with Google on `/account`.
   When ready for public access, publish the Google OAuth app and complete any
   requirements shown by Google.

The first successful sign-in creates a Supabase Authentication user
(`auth.users`). The existing `create_grub_profile` database trigger creates the
matching `public.profiles` row. Returning users sign into their existing account.
Social sign-up needs no app password or username; users can choose a username
later in Settings. Microsoft login is not offered by the app.

## Verification

Run `node --env-file=.env scripts/check-google-login.mjs` for a read-only check
of provider enablement, the OAuth redirect to Google, and the live account page.
It does not sign in a person or prove that consent, token exchange, and account
creation complete successfully.

To verify the complete flow, sign in with your own Google account, check
Supabase Authentication -> Users, confirm Account Settings loads, and sign out
and back in. The same user ID and saved preferences should remain. Also test
cancelling consent and retrying.

For local testing, add your actual local `/account` URL to Supabase Redirect
URLs. The Google callback remains the hosted Supabase callback above.

## Optional configuration script

Dashboard setup does not need a Supabase management token or provider secrets
in the app's environment. For automated setup only, add these privately to the
Git-ignored `.env`:

```dotenv
SUPABASE_ACCESS_TOKEN=your-personal-access-token
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
PUBLIC_SITE_URL=https://groupgrub-team.onrender.com
```

Run `node scripts/configure-social-login.mjs` for a read-only status check, or
use `--apply` to configure Google and allow the account redirect. The script
preserves existing redirects, the primary Site URL, and other provider settings.
It does not require Microsoft credentials. Never use `VITE_*` for secrets.

References: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Supabase management authentication](https://supabase.com/docs/reference/api/introduction).
