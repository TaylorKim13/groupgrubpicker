# Google and Microsoft sign-in

The configured project is `gcowxljjzmxwavhklyfu`. The app's Render build already
uses Supabase OAuth. Google is `google`; Microsoft is `azure` with the required
`email` scope. Both providers must also be configured outside the app.

For **both** provider applications, the authorized callback / Web redirect URI is:

```
https://gcowxljjzmxwavhklyfu.supabase.co/auth/v1/callback
```

1. In [Google Cloud](https://console.cloud.google.com/auth/clients), use the team's
   project and configure the Google Auth consent screen. Create a Web application
   OAuth client with the callback above. If the consent screen is in testing,
   add the intended testers; publish it when ready for public users. Save its
   client ID and secret privately.
2. In [Microsoft Entra](https://entra.microsoft.com/), open App registrations,
   register an application, and add that callback as a Web redirect URI. For a
   public app supporting school/work and personal Microsoft accounts, choose
   accounts in any organizational directory and personal Microsoft accounts.
   Create a client secret and copy its **Value**, not its Secret ID. Save the
   Application (client) ID as well. Keep track of the secret's expiry.
3. Create a [Supabase personal access token](https://supabase.com/dashboard/account/tokens)
   with access to the team project. This is different from the service-role key.
4. Add these settings privately to the existing, Git-ignored `.env`:

   ```dotenv
   SUPABASE_ACCESS_TOKEN=your-management-token
   GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
   GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
   MICROSOFT_OAUTH_CLIENT_ID=your-application-client-id
   MICROSOFT_OAUTH_CLIENT_SECRET=your-client-secret-value
   PUBLIC_SITE_URL=https://your-actual-public-website
   ```

   Keep these names out of `VITE_*`. Provider secrets and the management token
   are only needed for this local setup; they do not need to be deployed to the
   app. Keep the existing Supabase URL and public/service keys in `.env`.
5. Run `node scripts/configure-social-login.mjs` for a read-only status check,
   then `node scripts/configure-social-login.mjs --apply` to save the provider
   credentials, enable both providers, and add the site's `/account` redirect.
   The script preserves existing redirect URLs, the primary Site URL, and any
   existing Microsoft tenant restriction.
6. Test both buttons on the actual public website. Verify a new user returns
   signed in and that signing out and returning works. Provider enablement alone
   does not verify the Google consent screen or Microsoft app registration.

Alternatively, enter the client IDs and secrets manually under Supabase
Authentication → Sign In / Providers → Google and Azure, then add the website's
`/account` URL under Authentication → URL Configuration → Redirect URLs. This
does not require a management token.

References: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Supabase Microsoft setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure),
[Supabase management authentication](https://supabase.com/docs/reference/api/introduction).
