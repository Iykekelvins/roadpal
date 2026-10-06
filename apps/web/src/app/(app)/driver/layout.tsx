import { SessionProvider } from "../_components/session";

export default function DriverLayout({ children }: LayoutProps<"/driver">) {
  return <SessionProvider role="driver">{children}</SessionProvider>;
}
