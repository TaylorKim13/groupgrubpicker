# Assignment grading guide

The team site is https://groupgrub-team.onrender.com/. The instructor should receive a dedicated administrator email and password privately with the submission; do not commit credentials to this repository.

1. Open the site and choose **Sign in**, then sign in with the supplied administrator account.
2. Open **Your Account**, then **Admin**. The Admin tab is only visible to administrators.
3. Choose **Maintain Users** to create, view, edit, or delete a test account. Deleting an account is permanent and can affect its associated data; use only a disposable test account. Administrators cannot delete the account they are currently using here.
4. Choose **Maintain Records** to view restaurant deals, edit a deal's title, description, or status, or delete a deal. **Create deal** opens the existing public deal submission page; search for a real restaurant and enter the deal details. Public deal submission remains available to everyone.
5. Open **Settings** and choose **Sign out**. The local Supabase session is removed and administrator controls disappear. Sign in again to continue.

The existing administrator allowlist controls access to all maintenance operations. An existing administrator can grant an email access from the Metrics tab's **Dashboard administrators** section. The email must correspond to an account. Every maintenance operation checks access on the server. Passwords are never displayed.

Use disposable data for grading. Confirm the deployed version and credentials work before submitting this guide. Room data and internal supporting tables continue to be managed by their existing application workflows.
