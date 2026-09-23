import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { authorizeAdmin } from "./auth";
import "./styles.css";
import "./human-first.css";

type AuthState = "checking" | "authorized" | "signed_out" | "forbidden" | "error";

function AdminGate() {
  const [state, setState] = useState<AuthState>("checking");

  async function checkAccess() {
    setState("checking");
    try {
      setState(await authorizeAdmin());
    } catch (error) {
      console.error("Traffic Intelligence admin authorization failed", error);
      setState("error");
    }
  }

  useEffect(() => {
    void checkAccess();
  }, []);

  if (state === "authorized") return <App />;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <section style={{ width: "min(680px, 100%)" }}>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.7 }}>GFD Admin</p>
        <h1>Traffic Intelligence</h1>
        {state === "checking" ? (
          <p>Verifying your GFD administrator session…</p>
        ) : (
          <>
            <p>
              {state === "forbidden"
                ? "Your signed-in account is not authorized for GFD Traffic Intelligence."
                : state === "error"
                  ? "Administrator verification is temporarily unavailable."
                  : "Sign in through the GFD Command Center to access Traffic Intelligence."}
            </p>
            <p>
              <a href="https://goodflippindesign.com/admin.html">Open GFD Command Center</a>
              {" · "}
              <button type="button" onClick={() => void checkAccess()}>Retry access</button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}

/**
 * Local Traffic preview only (`npm run traffic:dev` from repo root, or `npm run dev` here):
 * render committed fixtures without Clerk so the product can be developed and reviewed locally.
 * Vite compiles import.meta.env.DEV to false in production builds, removing this branch;
 * scripts/check-no-dev-auth-bypass.mjs fails the build if the marker below survives into dist/.
 */
function LocalDevPreview() {
  return (
    <>
      <p className="local-dev-preview" data-ti-local-dev-auth-bypass="">
        Local dev preview · admin gate bypassed · committed fixture data
      </p>
      <App />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>{import.meta.env.DEV ? <LocalDevPreview /> : <AdminGate />}</StrictMode>,
);
