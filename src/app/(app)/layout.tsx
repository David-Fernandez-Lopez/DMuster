import NavBar from "@/components/nav/NavBar";

/**
 * Layout for the authenticated app shell. Renders the shared top navigation bar
 * above every page in the `(app)` route group. Authentication is enforced
 * per-page (each page calls `auth()` and redirects anonymous users), consistent
 * with the rest of the app and the cookie check in `src/proxy.ts`.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <NavBar />
      {children}
    </>
  );
}
