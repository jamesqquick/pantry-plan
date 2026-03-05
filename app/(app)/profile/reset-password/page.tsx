import { redirect } from "next/navigation";

/** Reset password form now lives on the profile page; redirect old links. */
export default function ResetPasswordPage() {
  redirect("/profile");
}
