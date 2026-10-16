# Quick Pantry plugin

This package connects ChatGPT to the hosted [Quick Pantry](https://quickpantry.app)
MCP server. Any signed-in Quick Pantry user can authorize their own account with
OAuth. Recipe details and meal-plan links appear in normal ChatGPT responses.

Publisher: James Quick. Source: [jamesqquick/pantry-plan](https://github.com/jamesqquick/pantry-plan).

## Package contents

```text
quick-pantry/
├── plugin.json
├── mcp.json
├── assets/
│   └── logo.svg
└── README.md
```

`plugin.json` uses Agent Plugins 1.0.0 with OpenAI listing and review metadata.
`mcp.json` declares one hosted Streamable HTTP server. The square logo is copied
from Quick Pantry's public favicon and is used for both the listing and composer.

For upload, make a ZIP containing only `plugin.json`, `mcp.json`, and
`assets/logo.svg`. Put the manifests at the archive root, with no enclosing
`quick-pantry/` directory. Exclude this README, which is maintainer documentation,
not a skill. This package contains no bundled skills or custom ChatGPT UI.

From the repository root, create the ignored output directory with `mkdir -p tmp`.
Then run these commands from `plugins/quick-pantry`:

```bash
zip -X ../../tmp/quick-pantry-1.0.0.zip plugin.json mcp.json assets/logo.svg
unzip -l ../../tmp/quick-pantry-1.0.0.zip
```

The listing must contain exactly the two manifests and `assets/logo.svg`. Use a
new output filename when changing the version so an older ZIP cannot retain
removed files.

The portable MCP 1.0.0 schema does not include per-server `extensions`. Validate
the transport fields against that schema and check the
[`extensions.com.openai.auth` fields against OpenAI's reference](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication).
OpenAI's upload checks validate its overlay; a generic portable-schema check alone
does not validate the complete OpenAI package.

## Tools and permissions

| Scope | Tools |
| --- | --- |
| `recipes:read` | `search_recipes`, `get_recipe` |
| `recipes:write` | `create_recipe`, `import_recipe_from_url`, `edit_recipe` |
| `meal-plans:write` | `create_weekly_meal_plan` |
| `offline_access` | Allows refresh tokens for the user's OAuth grant. |

Search is limited to the connected account's recipes. Natural-language semantic
search depends on the account's feature availability; title matching is the
fallback. Recipe writes use structured ingredients. Editing a supplied ingredient
or instruction list replaces that whole list. Quick Pantry weeks start on Sunday.
Creating a weekly meal plan replaces the entire selected week, so the request must
specify the intended meals.

The plugin cannot delete recipes, edit tags, manage pantry ingredient records,
manage orders or grocery lists, or make purchases.

## Hosted OAuth setup

| Setting | Value |
| --- | --- |
| MCP endpoint and OAuth resource | `https://quickpantry.app/mcp` |
| Authorization-server issuer | `https://quickpantry.app/api/auth` |
| Pre-registered public client ID | `quick-pantry-chatgpt` |
| Client registration mode | `provided` |
| Token endpoint authentication | `none` |
| Authorization flow | Authorization code with PKCE `S256` |
| Refresh | Refresh-token grant with `offline_access` |
| Requested scopes | `recipes:read recipes:write meal-plans:write offline_access` |

The package relies on OAuth discovery for authorization and token endpoints.
Apply the application's committed D1 migrations to the target database before
deploying the discovery and OAuth handlers. Use the existing `AUTH_SECRET` and
set `AUTH_URL` to the deployed origin. Run the
[repository checks and deployment steps](../../README.md#chatgpt-oauth) before
connecting it in OpenAI. This is a public client and does not use a client secret.

During OpenAI connection setup, copy the exact callback URL supplied by OpenAI.
A Quick Pantry administrator must register that URL for `quick-pantry-chatgpt`
in **Profile → ChatGPT publisher setup → Save OAuth client**. Match the complete callback exactly;
do not guess a callback URL or register a wildcard. Admin setup registers the
client's callback, while every signed-in user approves their own OAuth grant.
Saving a new callback replaces the allowlist for future authorizations. The setup
accepts HTTPS `chatgpt.com` callbacks at `/connector_platform_oauth_redirect` or
`/connector/oauth/{callback_id}`. Administrators share management of this
application-owned client.

After deployment, check these public endpoints:

| Endpoint | Expected result |
| --- | --- |
| `/.well-known/oauth-protected-resource/mcp` | Resource `https://quickpantry.app/mcp`, authorization server `https://quickpantry.app/api/auth`, and the three MCP scopes. |
| `/.well-known/oauth-authorization-server/api/auth` | Matching issuer, authorization and token endpoints, PKCE `S256`, and token authentication method `none`; no registration endpoint. |
| `/mcp` without a bearer token | `401` with a `WWW-Authenticate` challenge pointing at protected-resource metadata. |
| `/privacy`, `/terms`, `/support` | Public pages identifying Quick Pantry and its publisher. |

The root `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server` paths provide discovery aliases. Access
tokens last one hour; refresh tokens last 30 days and rotate on use. Quick Pantry
checks the current account grant on each MCP request. If the token's associated
Quick Pantry sign-in session expires, refresh returns `invalid_grant` so the
client can ask the user to reconnect.

Users sign in at [Quick Pantry login](https://quickpantry.app/login), review the
requested permissions, and authorize their account. They can revoke the OAuth
connection from **Profile**. Existing MCP keys are a separate connection method;
the public ChatGPT package uses OAuth.

## Prepare reviewer access

Create a dedicated reviewer account with email/password sign-in at
`https://quickpantry.app/login`. Give it representative sample data rather than
any real user's private recipes. It must be usable immediately without MFA
approval, one-time email or SMS codes, magic links, or private-network access.
Provide the actual credentials and sign-in instructions only in the submission
portal's private **Review details** form.

Before running the review cases, manually save these two fixture recipes in that
account. Both should serve 2 people, and their notes should initially say
`Reviewer fixture.`:

| Title | Ingredients | Ordered instructions |
| --- | --- | --- |
| Lemon chickpea bowls | 1 can chickpeas, drained; 1 lemon; 1 cup cooked rice | Drain and rinse the chickpeas. Squeeze the lemon over the chickpeas. Divide the chickpeas and cooked rice between two bowls. |
| Tomato pasta | 200 g pasta; 1 cup tomato sauce; 1 tsp olive oil | Cook the pasta according to its package instructions. Warm the tomato sauce with the olive oil. Drain the pasta and combine it with the sauce. |

Keep fixture titles unique so title search finds them without semantic search.
Use a disposable week for the meal-plan case. Restore fixture notes and that
week's sample data before repeating the walkthrough, and keep the reviewer account
available for subsequent reviews.

## Review cases

`plugin.json` contains exactly five positive and three negative cases under
`extensions.com.openai.review.test_cases`. Each includes a prompt and expected
outcome; positive cases also name the expected tools. Together the positive cases
cover all six tools. These are test definitions, not a record of executed ChatGPT
tests.

Run all eight cases in ChatGPT with the reviewer account before submitting.
Check the saved recipes and meal plan in Quick Pantry as well as the chat's
response. Record the actual outcomes. Demonstrate the cases and authorization
flow in a video walkthrough, then provide a reviewer-accessible recording URL in
**Review details**. The package omits `demo_recording_url` until a real recording
exists; it can be added to the manifest for a later upload.

## Submit and publish

1. Deploy the integrated application and verify that the MCP endpoint, discovery,
   OAuth flow, and public [privacy](https://quickpantry.app/privacy),
   [terms](https://quickpantry.app/terms), and
   [support](https://quickpantry.app/support) pages are reachable. Confirm the
   listing identifies the same publisher as the submission.
2. Complete individual or business verification for the publishing identity in
   [OpenAI organization settings](https://platform.openai.com/settings/organization/general).
   Select the owning organization and project. Submission requires an
   organization owner or a member with **Apps Management Write**.
3. Upload the release ZIP at [OpenAI Plugins](https://platform.openai.com/plugins)
   and select the verified developer identity. Review the imported listing,
   authentication configuration, test cases, and release notes.
4. Under **MCPs**, connect `https://quickpantry.app/mcp`. Register OpenAI's exact
   callback through Quick Pantry's admin setup before completing OAuth. Confirm
   the saved client ID, public-client authentication method, and scopes.
5. Complete domain verification using the portal's exact challenge text at
   `https://quickpantry.app/.well-known/openai-apps-challenge`. The application's
    hosted handler must return only that text as plain text, with no JSON wrapper
    or list of tokens. Set the Worker's `OPENAI_APPS_CHALLENGE` value to that
    exact text. The handler returns `404` when unset. The challenge is deployment
    configuration, not a file in this package.
6. Authorize the reviewer account, finish the tool scan, and resolve required
   connection, metadata, or tool findings. Confirm that exactly the six supported
   tools are discovered.
7. Run the review cases, record the walkthrough, enter private reviewer access
   details, and save the review information. The publisher's account verification,
   actual ChatGPT walkthrough, and recording URL remain release steps.
8. Submit the selected draft for review. Once OpenAI approves it, select
   **Publish plugin** to make it available in the public directory.

A successful build or merged PR does not submit, approve, or publish the plugin
in OpenAI. Run the repository's full tests, typecheck, and production build after
integration; complete the hosted and ChatGPT checks separately before submission.

For metadata or asset updates, increment the package version and upload a complete
replacement ZIP to the existing plugin. Hosted tool updates use the portal's MCP
scan flow. Preserve the approved tool schemas until updated definitions are live.

## References

- [OpenAI package guide](https://developers.openai.com/plugins/build/plugins.md)
- [OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission.md)
- [Quick Pantry support](https://quickpantry.app/support)
