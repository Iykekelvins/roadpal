import { SessionProvider } from "../_components/session";

export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return <SessionProvider role="provider">{children}</SessionProvider>;
}
