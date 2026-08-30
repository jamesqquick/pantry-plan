const EMAIL_FROM = {
  email: "noreply@quickpantry.app",
  name: "Quick Pantry",
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPasswordResetEmail(
  email: SendEmail,
  recipient: string,
  resetUrl: string,
): Promise<{ messageId: string }> {
  const safeResetUrl = escapeHtml(resetUrl);

  return email.send({
    to: recipient,
    from: EMAIL_FROM,
    subject: "Reset your Quick Pantry password",
    text: [
      "Reset your Quick Pantry password",
      "",
      "Use this link to choose a new password:",
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <h1>Reset your Quick Pantry password</h1>
      <p>Use the link below to choose a new password:</p>
      <p><a href="${safeResetUrl}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}
