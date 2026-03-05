# Plan: Profile and Password Management

**Goal:** Support user-editable profile fields and password changes via a settings/account area, with **profile updates** and **password management** kept strictly separate: different sections, different forms, and different server actions.

---

## 1. Overview

| Concern | Scope | Server action(s) | Form |
|--------|--------|-------------------|------|
| **Profile** | Name, email (if allowed), etc. | `updateProfileAction` (or one per field group) | Profile section form |
| **Password** | Change password (current + new) | `changePasswordAction` | Password section form |

- Profile and password **must not** share a single form or action.
- Each section submits to its own action and shows its own validation/errors.
- Revalidation and redirects are scoped per action.

---

## 2. Profile section

### 2.1 Purpose
Allow the user to update **profile fields only** (e.g. display name, and optionally email if you support changing it). No password fields or password logic in this flow.

### 2.2 Profile fields (candidate)
- **Name** — `User.name` (optional). Display only; no login impact.
- **Email** — `User.email` (optional to allow editing). If editable: must remain unique; consider requiring re-verification or current password in a future iteration. For a minimal plan, name-only is enough.

Recommendation: start with **name only**; add email later with its own rules (uniqueness, verification).

### 2.3 Server action: profile only
- **Name:** e.g. `updateProfileAction(_prev, formData)`.
  - Auth: `getAuthenticatedUser()`.
  - Validate with a **profile-only** Zod schema (e.g. `profileUpdateSchema`: `{ name: z.string().optional() }` or `{ name: z.string().max(…) }`).
  - Update `User` where `id === session.user.id`: set only profile fields (e.g. `name`).
  - Return standard `ActionResult`; revalidate as needed (e.g. paths that show user name).
  - **Must not** accept or touch password, currentPassword, or passwordHash.

### 2.4 Profile form (UI)
- Single form in the “Profile” section.
- Fields: only profile fields (e.g. name; email if in scope).
- Submit → `updateProfileAction` only.
- Show success/error from that action only (e.g. `fieldErrors` for profile fields).

---

## 3. Password section

### 3.1 Purpose
Allow the user to **change their password** by providing current password and new password. Isolated from profile; no name/email in this flow.

### 3.2 Server action: password only
- **Name:** e.g. `changePasswordAction(_prev, formData)`.
  - Auth: `getAuthenticatedUser()`.
  - Validate with a **password-only** Zod schema, e.g.:
    - `currentPassword: z.string().min(1, "Current password is required")`
    - `newPassword: z.string().min(8, "New password must be at least 8 characters")`
    - Optional: `confirmNewPassword` and refine that it matches `newPassword`.
  - Load user (e.g. by `session.user.id`), then verify `currentPassword` with `verifyPassword(currentPassword, user.passwordHash)`.
  - If invalid: return `{ ok: false, error: { code: "FORBIDDEN", message: "Current password is incorrect" } }` (or similar).
  - If valid: hash new password with `hashPassword(newPassword)`, update `User` set `passwordHash` only.
  - Return standard `ActionResult`; do **not** update name, email, or any profile field.
  - Optional: after success, call `signOut` and redirect to login so the user signs in with the new password (or keep them signed in and only show success).

### 3.3 Password form (UI)
- Separate form in the “Password” or “Security” section.
- Fields: current password, new password, confirm new password (if desired).
- Submit → `changePasswordAction` only.
- Show success/error from that action only (e.g. `fieldErrors` for password fields or a single `message`).

---

## 4. What to avoid

- **Single “account” action** that accepts both profile fields and password: do not do this. Keep two (or more) actions.
- **Profile action** that reads or updates `passwordHash` or any password field.
- **Password action** that reads or updates `name`, `email`, or any profile field.
- **Single form** that posts both profile and password: use two forms (profile form and password form), each with its own action.

---

## 5. File and schema sketch

### 5.1 Schemas (e.g. `features/auth/` or `features/profile/`)
- **Profile:** e.g. `profileUpdateSchema` with `name` (and optionally `email` with uniqueness handled in the action).
- **Password:** e.g. `changePasswordSchema` with `currentPassword`, `newPassword`, and optionally `confirmNewPassword`.

### 5.2 Actions
- **Profile:** e.g. `app/actions/profile.actions.ts` → `updateProfileAction` (or under `auth.actions.ts` with a clear profile-only name).
- **Password:** e.g. `app/actions/auth.actions.ts` → `changePasswordAction`, or a dedicated `app/actions/password.actions.ts` with only password-related actions.

### 5.3 UI
- One section: “Profile” (or “Account”) with profile form → profile action.
- Another section: “Password” (or “Security”) with password form → password action.
- Optional: single settings page with both sections rendered as separate forms.

---

## 6. Summary checklist

| Item | Profile | Password |
|------|--------|----------|
| **Section** | Profile / Account | Password / Security |
| **Fields** | Name (and optionally email) | Current password, new password, confirm |
| **Server action** | `updateProfileAction` | `changePasswordAction` |
| **Schema** | Profile-only (e.g. `profileUpdateSchema`) | Password-only (e.g. `changePasswordSchema`) |
| **Updates** | Only `User` profile columns | Only `User.passwordHash` |
| **Form** | One form, profile action | One form, password action |
| **Distinct** | No password in payload or logic | No profile fields in payload or logic |

This keeps profile updates and password management clearly separated and easier to secure and maintain.
