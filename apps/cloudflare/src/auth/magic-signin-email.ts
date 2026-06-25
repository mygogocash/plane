/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function buildMagicSignInEmailSubject(token: string): string {
  return `Your unique Manut login code is ${token}`;
}

export function buildMagicSignInPlainText(email: string, token: string): string {
  return [
    `Your login code for Manut is ${token}.`,
    "",
    "This code is valid for the next 10 minutes.",
    "",
    `This email was sent to ${email}. If you were not expecting a sign-in code, you can safely ignore this message.`,
  ].join("\n");
}

export function buildMagicSignInHtml(email: string, token: string): string {
  const escapedEmail = escapeHtml(email);
  const escapedToken = escapeHtml(token);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Your Manut login code</title>
  </head>
  <body style="margin:0;padding:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f9f9f9;color:#474747;">
    <center style="width:100%;background-color:#f9f9f9;padding:40px 0;">
      <table role="presentation" width="100%">
        <tr>
          <td></td>
          <td width="620" style="width:620px;max-width:620px;margin:0 auto;">
            <table role="presentation" width="100%" style="background-color:#000000;">
              <tr>
                <td style="padding:24px 40px;text-align:center;">
                  <img src="https://manut.xyz/manut-logo.jpeg" width="120" alt="Manut" style="height:auto;display:block;margin:0 auto;" />
                </td>
              </tr>
            </table>
          </td>
          <td></td>
        </tr>
      </table>
      <table role="presentation" width="100%">
        <tr>
          <td></td>
          <td width="620" style="width:620px;max-width:620px;margin:0 auto;">
            <table role="presentation" width="100%" style="background-color:#ffffff;padding:32px 40px;">
              <tr>
                <td style="font-size:16px;line-height:1.5;color:#474747;padding:24px;">
                  <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;font-weight:600;color:#111111;">Your login code for Manut</h1>
                  <p style="margin:12px 0 24px;">
                    <span style="display:inline-block;padding:8px 14px;background-color:#e4e5e7;border-radius:6px;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:15px;letter-spacing:0.14em;text-transform:uppercase;color:#111111;">${escapedToken}</span>
                  </p>
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#5f5e5e;">This code is valid for the next 10 minutes. Enter it on the sign-in page to complete your login.</p>
                  <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#5f5e5e;">Note: This email was sent to <span style="font-family:monospace;font-size:12px;background-color:#f3f3f3;padding:2px 4px;border-radius:3px;border:1px solid #e9e9e9;">${escapedEmail}</span>. If you were not expecting a sign-in code, you can safely ignore this message.</p>
                </td>
              </tr>
            </table>
          </td>
          <td></td>
        </tr>
      </table>
    </center>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
