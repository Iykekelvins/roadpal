import type { Metadata } from "next";
import { UserRoleSchema } from "@repo/shared";
import { LoginFlow } from "./_components/login-flow";

export const metadata: Metadata = { title: "Log in" };

// Server component: reads ?as=driver|provider (from the landing page buttons) and hands it to the
// interactive form. Anything else in the URL is ignored rather than trusted.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { as } = await searchParams;
  const role = UserRoleSchema.safeParse(as);
  return <LoginFlow suggestedRole={role.success ? role.data : undefined} />;
}
